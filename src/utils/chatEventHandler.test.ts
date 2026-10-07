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

function startTurn(text = "hello") {
  const store = useChatStore.getState();
  store.newConversation();
  store.addUserMessage(text);
  useChatStore.getState().startAssistantMessage();
}

function done(response: string, sessionId = "s-1") {
  handleChatEvent({ type: "chat_event", event: "done", response, sessionId });
}

function contents() {
  return useChatStore.getState().messages.map((m) => m.content);
}

describe("handleChatEvent", () => {
  it("keeps the conversation's session when a turn fails", () => {
    startTurn();
    handleChatEvent({ type: "chat_event", event: "session_init", sessionId: "s-1" });
    done("hi");

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
    startTurn();
    useChatStore.getState().deleteAllConversations();
    done("hi", "deleted-session");

    const state = useChatStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.sessionId).not.toBe("deleted-session");
    expect(state.conversations[0].sessionId).not.toBe("deleted-session");
    expect(state.conversations[0].messages).toEqual([]);
  });

  it("keeps the streamed text when an answer is stopped", () => {
    startTurn();
    handleChatEvent({ type: "chat_event", event: "text_delta", text: "partial" });
    done("");

    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(contents()).toEqual(["hello", "partial"]);
  });

  it("keeps the conversation's session when a stopped turn reports none", () => {
    startTurn();
    handleChatEvent({ type: "chat_event", event: "session_init", sessionId: "s-own" });
    done("hi", "s-own");

    useChatStore.getState().addUserMessage("again");
    useChatStore.getState().startAssistantMessage();
    handleChatEvent({ type: "chat_event", event: "done", response: "" });

    const state = useChatStore.getState();
    expect(state.sessionId).toBe("s-own");
    expect(state.conversations[0].sessionId).toBe("s-own");
  });

  it("drops the empty reply of an answer stopped before any output", () => {
    startTurn();
    done("");

    const state = useChatStore.getState();
    expect(state.messages.map((m) => m.role)).toEqual(["user"]);
    expect(state.conversations[0].messages).toHaveLength(1);
  });

  it("shows the final answer", () => {
    startTurn();
    done("hi");

    expect(contents()).toEqual(["hello", "hi"]);
  });

  it("explains a model the ChatGPT plan doesn't include", () => {
    startTurn();
    handleChatEvent({
      type: "chat_event",
      event: "error",
      providerId: "codex",
      code: "model_unavailable",
      model: "gpt-6-sol",
      message:
        "The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.",
    });

    const reply = contents().at(-1) ?? "";
    expect(reply).toContain("GPT-6 Sol");
    expect(reply).toContain("isn't available with your ChatGPT plan");
  });
});
