import { describe, it, expect, beforeEach, vi } from "vitest";
import { useChatStore } from "./chatStore";

function reset() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    sessionId: null,
    isStreaming: false,
    selectedModel: "claude-sonnet-5",
    providerSwitch: null,
  });
}

function startConversation(text = "hello") {
  useChatStore.getState().newConversation();
  useChatStore.getState().addUserMessage(text);
  const id = useChatStore.getState().activeConversationId;
  if (!id) throw new Error("no active conversation");
  return id;
}

describe("chatStore conversations", () => {
  beforeEach(reset);

  it("records the provider and model on the first message", () => {
    startConversation();
    const [c] = useChatStore.getState().conversations;
    expect(c.provider).toBe("claude");
    expect(c.model).toBe("claude-sonnet-5");
    expect(c.name).toBe("hello");
  });

  it("stays in the conversation when the model changes within the provider", () => {
    const id = startConversation();
    useChatStore.getState().selectModel("claude-opus-5-5");
    expect(useChatStore.getState().activeConversationId).toBe(id);
    expect(useChatStore.getState().conversations[0].model).toBe("claude-opus-5-5");
  });

  it("opens a new conversation when the provider changes after messages", () => {
    const id = startConversation();
    useChatStore.getState().selectModel("gpt-6-sol");
    const s = useChatStore.getState();
    expect(s.activeConversationId).not.toBe(id);
    expect(s.messages).toEqual([]);
    expect(s.selectedModel).toBe("gpt-6-sol");
    expect(s.providerSwitch).toEqual({ from: "claude", model: "gpt-6-sol" });
  });

  it("switches provider freely before the first message", () => {
    useChatStore.getState().newConversation();
    const id = useChatStore.getState().activeConversationId;
    useChatStore.getState().selectModel("gpt-6-sol");
    expect(useChatStore.getState().activeConversationId).toBe(id);
    expect(useChatStore.getState().providerSwitch).toBeNull();
  });

  it("restores a conversation's model when switching to it", () => {
    const first = startConversation();
    useChatStore.getState().selectModel("gpt-6-sol");
    useChatStore.getState().addUserMessage("salut");
    useChatStore.getState().switchConversation(first);
    expect(useChatStore.getState().selectedModel).toBe("claude-sonnet-5");
    expect(useChatStore.getState().providerSwitch).toBeNull();
  });

  it("falls back to the provider's default model for older conversations", () => {
    useChatStore.getState().setConversations([
      {
        id: "old",
        name: "old",
        sessionId: "01a0df46-ef49-77a3-8806-8097a762e178",
        messages: [
          {
            id: "m",
            role: "user",
            content: "x",
            toolCalls: [],
            timestamp: "2026-01-01T00:00:00Z",
          },
        ],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(useChatStore.getState().selectedModel).toBe("gpt-6-sol");
  });

  it("renames, and keeps the manual title", () => {
    const id = startConversation();
    useChatStore.getState().renameConversation(id, "  Schéma blog  ");
    let c = useChatStore.getState().conversations[0];
    expect(c.name).toBe("Schéma blog");
    expect(c.nameEdited).toBe(true);
    useChatStore.getState().renameConversation(id, "   ");
    c = useChatStore.getState().conversations[0];
    expect(c.name).toBe("Schéma blog");
  });

  it("does not bump updatedAt when merely switching", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
    const first = startConversation("one");
    vi.setSystemTime(new Date("2026-09-27T11:00:00Z"));
    startConversation("two");
    useChatStore.getState().switchConversation(first);
    vi.useRealTimers();
    const c = useChatStore.getState().conversations.find((x) => x.id === first);
    expect(c?.updatedAt).toBe("2026-09-27T10:00:00.000Z");
  });

  it("deletes everything and leaves one empty conversation", () => {
    startConversation();
    useChatStore.getState().deleteAllConversations();
    const s = useChatStore.getState();
    expect(s.conversations).toHaveLength(1);
    expect(s.conversations[0].messages).toEqual([]);
    expect(s.activeConversationId).toBe(s.conversations[0].id);
  });
});
