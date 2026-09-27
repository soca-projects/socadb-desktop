import { describe, it, expect, beforeEach, vi } from "vitest";
import { useChatStore } from "../stores/chatStore";
import { handleChatEvent } from "./chatEventHandler";

vi.mock("./chatCommands", () => ({ resetAgent: vi.fn() }));

beforeEach(() => {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    sessionId: null,
    isStreaming: false,
    selectedModel: "claude-sonnet-5",
    providerSwitch: null,
  });
});

describe("handleChatEvent", () => {
  it("keeps the conversation's session when a turn fails", () => {
    const store = useChatStore.getState();
    store.newConversation();
    store.addUserMessage("hello");
    handleChatEvent({ type: "chat_event", event: "session_init", sessionId: "s-1" });
    handleChatEvent({
      type: "chat_event",
      event: "done",
      response: "hi",
      sessionId: "s-1",
    });

    useChatStore.getState().addUserMessage("again");
    useChatStore.getState().startAssistantMessage();
    handleChatEvent({
      type: "chat_event",
      event: "error",
      providerId: "claude",
      message: "Connection reset",
    });

    const state = useChatStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.sessionId).toBe("s-1");
    expect(state.conversations[0].sessionId).toBe("s-1");
  });

  it("keeps a stale answer's session out of the conversation now open", () => {
    const store = useChatStore.getState();
    store.newConversation();
    store.addUserMessage("hello");
    useChatStore.getState().deleteAllConversations();
    handleChatEvent({
      type: "chat_event",
      event: "done",
      response: "hi",
      sessionId: "deleted-session",
    });

    const state = useChatStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.sessionId).not.toBe("deleted-session");
    expect(state.conversations[0].sessionId).not.toBe("deleted-session");
    expect(state.conversations[0].messages).toEqual([]);
  });
});
