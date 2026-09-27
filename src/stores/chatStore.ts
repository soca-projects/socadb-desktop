import { create } from "zustand";
import type {
  ChatMessage,
  EffortLevel,
  Provider,
  ToolCallInfo,
  Conversation,
  ProviderId,
} from "../types/chat";
import {
  DEFAULT_EFFORT_BY_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  EFFORT_LEVELS_BY_PROVIDER,
  PROVIDER_IDS,
  getProviderFromModel,
  makeProvider,
} from "../types/chat";
import { genId } from "../utils/id";
import { providerFromSessionId } from "../utils/conversationFiles";

function defaultProviders(): Record<string, Provider> {
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, makeProvider(id)]));
}

const EFFORT_STORAGE_PREFIX = "socadb-effort-";

function loadEffortByProvider(): Record<ProviderId, EffortLevel> {
  const result = { ...DEFAULT_EFFORT_BY_PROVIDER };
  for (const id of PROVIDER_IDS) {
    try {
      const stored = localStorage.getItem(`${EFFORT_STORAGE_PREFIX}${id}`);
      if (stored && EFFORT_LEVELS_BY_PROVIDER[id].includes(stored as EffortLevel)) {
        result[id] = stored as EffortLevel;
      }
    } catch {
      /* empty */
    }
  }
  return result;
}

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
  effortByProvider: Record<ProviderId, EffortLevel>;

  messages: ChatMessage[];
  sessionId: string | null;
  selectedModel: string;
  providerSwitch: { from: ProviderId; model: string } | null;

  newConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  setConversations: (conversations: Conversation[]) => void;
  selectModel: (modelId: string) => void;
  renameConversation: (id: string, name: string) => void;
  deleteAllConversations: () => void;

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
  setEffort: (providerId: ProviderId, effort: EffortLevel) => void;
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

// Switching conversations must not reorder the history, so no updatedAt bump here.
function syncedConversations(state: ChatState): Conversation[] {
  if (!state.activeConversationId) return state.conversations;
  return state.conversations.map((c) =>
    c.id === state.activeConversationId
      ? { ...c, messages: state.messages, sessionId: state.sessionId }
      : c,
  );
}

function modelFor(conversation: Conversation, fallback: string): string {
  if (conversation.model) return conversation.model;
  const provider = conversation.provider ?? providerFromSessionId(conversation.sessionId);
  if (!provider || provider === getProviderFromModel(fallback)) return fallback;
  return DEFAULT_MODEL_BY_PROVIDER[provider];
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
  selectedModel: DEFAULT_MODEL,
  providerSwitch: null,
  providers: defaultProviders(),
  effortByProvider: loadEffortByProvider(),

  newConversation: () =>
    set((state) => {
      const conv = createConversation();
      return {
        conversations: [conv, ...syncedConversations(state)],
        activeConversationId: conv.id,
        messages: [],
        sessionId: null,
        isStreaming: false,
        providerSwitch: null,
      };
    }),

  switchConversation: (id) =>
    set((state) => {
      const target = state.conversations.find((c) => c.id === id);
      if (!target) return {};
      return {
        conversations: syncedConversations(state),
        activeConversationId: id,
        messages: target.messages,
        sessionId: target.sessionId,
        isStreaming: false,
        selectedModel: modelFor(target, state.selectedModel),
        providerSwitch: null,
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

  setConversations: (conversations) =>
    set((state) => {
      const active = conversations[0];
      return {
        conversations,
        activeConversationId: active?.id ?? null,
        messages: active?.messages ?? [],
        sessionId: active?.sessionId ?? null,
        selectedModel: active
          ? modelFor(active, state.selectedModel)
          : state.selectedModel,
      };
    }),

  selectModel: (modelId) =>
    set((state) => {
      const next = getProviderFromModel(modelId);
      const active = state.conversations.find((c) => c.id === state.activeConversationId);
      const current = active?.provider ?? providerFromSessionId(state.sessionId);
      if (state.messages.length > 0 && current && current !== next) {
        const conv = createConversation();
        return {
          conversations: [conv, ...syncedConversations(state)],
          activeConversationId: conv.id,
          messages: [],
          sessionId: null,
          selectedModel: modelId,
          providerSwitch: { from: current, model: modelId },
        };
      }
      return {
        selectedModel: modelId,
        conversations:
          active && state.messages.length > 0
            ? state.conversations.map((c) =>
                c.id === active.id ? { ...c, model: modelId } : c,
              )
            : state.conversations,
      };
    }),

  renameConversation: (id, name) =>
    set((state) => {
      const trimmed = name.trim();
      if (!trimmed) return {};
      return {
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, name: trimmed, nameEdited: true } : c,
        ),
      };
    }),

  deleteAllConversations: () =>
    set(() => {
      const conv = createConversation();
      return {
        conversations: [conv],
        activeConversationId: conv.id,
        messages: [],
        sessionId: null,
        providerSwitch: null,
      };
    }),

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

      const isFirst = state.messages.length === 0;

      return {
        messages: msgs,
        isStreaming: true,
        streamingConversationId: activeId,
        providerSwitch: null,
        conversations: convs.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: msgs,
                provider: getProviderFromModel(state.selectedModel),
                model: state.selectedModel,
                ...(isFirst && !c.nameEdited ? { name: autoName(msgs) } : {}),
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

  setEffort: (providerId, effort) =>
    set((state) => {
      if (state.effortByProvider[providerId] === effort) return state;
      try {
        localStorage.setItem(`${EFFORT_STORAGE_PREFIX}${providerId}`, effort);
      } catch {
        // ignore
      }
      return {
        effortByProvider: { ...state.effortByProvider, [providerId]: effort },
      };
    }),

  setMessages: (messages) => set({ messages }),

  setSessionId: (sessionId) => set({ sessionId }),
}));
