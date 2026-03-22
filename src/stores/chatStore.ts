import { create } from "zustand";
import type { ChatMessage, Provider, ToolCallInfo } from "../types/chat";
import { genId } from "../utils/id";

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  isPanelOpen: boolean;
  provider: Provider | null;

  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  setAssistantText: (text: string) => void;
  appendAssistantText: (text: string) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  updateLastToolCall: (toolUseId: string, result: string, isSuccess: boolean) => void;
  finishResponse: (sessionId: string) => void;
  togglePanel: () => void;
  clearHistory: () => void;
  setProvider: (provider: Provider) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setSessionId: (sessionId: string | null) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  sessionId: null,
  isStreaming: false,
  isPanelOpen: false,
  provider: null,

  addUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: genId(),
          role: "user",
          content,
          toolCalls: [],
          timestamp: new Date().toISOString(),
        },
      ],
      isStreaming: true,
    })),

  startAssistantMessage: () =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: genId(),
          role: "assistant",
          content: "",
          toolCalls: [],
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  setAssistantText: (text) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: text };
      }
      return { messages: msgs };
    }),

  appendAssistantText: (text) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      }
      return { messages: msgs };
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
      return { messages: msgs };
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
      return { messages: msgs };
    }),

  finishResponse: (sessionId) => set({ isStreaming: false, sessionId }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  clearHistory: () => set({ messages: [], sessionId: null }),

  setProvider: (provider) => set({ provider }),

  setMessages: (messages) => set({ messages }),

  setSessionId: (sessionId) => set({ sessionId }),
}));
