import { create } from "zustand";
import type {
  ChatMessage,
  Provider,
  ToolCallInfo,
  Conversation,
  ProviderId,
} from "../types/chat";
import { genId } from "../utils/id";

function createConversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: genId(),
    name: "New Chat",
    sessionId: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  streamingConversationId: string | null;
  isStreaming: boolean;
  isPanelOpen: boolean;
  providers: Record<string, Provider>;

  messages: ChatMessage[];
  sessionId: string | null;

  newConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  setConversations: (conversations: Conversation[]) => void;

  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  setAssistantText: (text: string) => void;
  appendAssistantText: (text: string) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  updateLastToolCall: (toolUseId: string, result: string, isSuccess: boolean) => void;
  finishResponse: (sessionId: string) => void;
  togglePanel: () => void;
  clearHistory: () => void;
  setProvider: (id: ProviderId, provider: Provider) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setSessionId: (sessionId: string | null) => void;
}

function syncToConversation(state: ChatState): Partial<ChatState> {
  if (!state.activeConversationId) return {};
  return {
    conversations: state.conversations.map((c) =>
      c.id === state.activeConversationId
        ? {
            ...c,
            messages: state.messages,
            sessionId: state.sessionId,
            updatedAt: new Date().toISOString(),
          }
        : c,
    ),
  };
}

function autoName(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Chat";
  const text = first.content.slice(0, 40);
  return text.length < first.content.length ? `${text}...` : text;
}

export const useChatStore = create<ChatState>()((set) => ({
  conversations: [],
  activeConversationId: null,
  streamingConversationId: null,
  messages: [],
  sessionId: null,
  isStreaming: false,
  isPanelOpen: false,
  providers: {},

  newConversation: () =>
    set((state) => {
      const synced = state.activeConversationId
        ? state.conversations.map((c) =>
            c.id === state.activeConversationId
              ? {
                  ...c,
                  messages: state.messages,
                  sessionId: state.sessionId,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          )
        : state.conversations;
      const conv = createConversation();
      return {
        conversations: [conv, ...synced],
        activeConversationId: conv.id,
        messages: [],
        sessionId: null,
        isStreaming: false,
      };
    }),

  switchConversation: (id) =>
    set((state) => {
      const target = state.conversations.find((c) => c.id === id);
      if (!target) return {};
      const synced = state.activeConversationId
        ? state.conversations.map((c) =>
            c.id === state.activeConversationId
              ? {
                  ...c,
                  messages: state.messages,
                  sessionId: state.sessionId,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          )
        : state.conversations;
      return {
        conversations: synced,
        activeConversationId: id,
        messages: target.messages,
        sessionId: target.sessionId,
        isStreaming: false,
      };
    }),

  deleteConversation: (id) =>
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== id);
      if (id === state.activeConversationId) {
        const next = remaining[0];
        if (next) {
          return {
            conversations: remaining,
            activeConversationId: next.id,
            messages: next.messages,
            sessionId: next.sessionId,
          };
        }
        const conv = createConversation();
        return {
          conversations: [conv],
          activeConversationId: conv.id,
          messages: [],
          sessionId: null,
        };
      }
      return { conversations: remaining };
    }),

  setConversations: (conversations) => {
    const active = conversations[0];
    return set({
      conversations,
      activeConversationId: active?.id ?? null,
      messages: active?.messages ?? [],
      sessionId: active?.sessionId ?? null,
    });
  },

  addUserMessage: (content) =>
    set((state) => {
      let convs = state.conversations;
      let activeId = state.activeConversationId;

      if (!activeId) {
        const conv = createConversation();
        convs = [conv, ...convs];
        activeId = conv.id;
      }

      const msgs = [
        ...state.messages,
        {
          id: genId(),
          role: "user" as const,
          content,
          toolCalls: [],
          timestamp: new Date().toISOString(),
        },
      ];

      const name = state.messages.length === 0 ? autoName(msgs) : undefined;

      return {
        messages: msgs,
        isStreaming: true,
        streamingConversationId: activeId,
        conversations: convs.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: msgs,
                ...(name ? { name } : {}),
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
        activeConversationId: activeId,
      };
    }),

  startAssistantMessage: () =>
    set((state) => {
      const msgs = [
        ...state.messages,
        {
          id: genId(),
          role: "assistant" as const,
          content: "",
          toolCalls: [],
          timestamp: new Date().toISOString(),
        },
      ];
      return { messages: msgs, ...syncToConversation({ ...state, messages: msgs }) };
    }),

  setAssistantText: (text) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: text };
      }
      return { messages: msgs, ...syncToConversation({ ...state, messages: msgs }) };
    }),

  appendAssistantText: (text) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      }
      return { messages: msgs, ...syncToConversation({ ...state, messages: msgs }) };
    }),

  addToolCall: (toolCall) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = {
          ...last,
          toolCalls: [...last.toolCalls, toolCall],
        };
      }
      return { messages: msgs, ...syncToConversation({ ...state, messages: msgs }) };
    }),

  updateLastToolCall: (toolUseId, result, isSuccess) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.toolCalls.length > 0) {
        const toolCalls = last.toolCalls.map((tc) =>
          tc.id === toolUseId ? { ...tc, result, isSuccess } : tc,
        );
        msgs[msgs.length - 1] = { ...last, toolCalls };
      }
      return { messages: msgs, ...syncToConversation({ ...state, messages: msgs }) };
    }),

  finishResponse: (sessionId) =>
    set((state) => ({
      isStreaming: false,
      streamingConversationId: null,
      sessionId,
      ...syncToConversation({ ...state, sessionId }),
    })),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  clearHistory: () => set({ messages: [], sessionId: null }),

  setProvider: (id, provider) =>
    set((state) => ({
      providers: { ...state.providers, [id]: provider },
    })),

  setMessages: (messages) => set({ messages }),

  setSessionId: (sessionId) => set({ sessionId }),
}));
