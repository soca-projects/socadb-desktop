import { describe, it, expect, beforeEach, vi } from "vitest";
import { useChatStore } from "../stores/chatStore";
import { handleChatEvent, handleChatSendFailure } from "./chatEventHandler";
import { escapeMarkdown } from "./chatMarkdown";

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

function lastError() {
  return useChatStore.getState().messages.at(-1)?.error;
}

function contents() {
  return useChatStore.getState().messages.map((m) => m.content);
}

describe("handleChatSendFailure", () => {
  it("keeps the agent's memory of the conversation", () => {
    startTurn();
    done("hi", "s-1");
    const store = useChatStore.getState();
    store.addUserMessage("again");
    store.startAssistantMessage();

    handleChatSendFailure("claude", new Error("Agent runner not found"));

    const state = useChatStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.sessionId).toBe("s-1");
    expect(state.conversations[0].sessionId).toBe("s-1");
    expect(lastError()).toContain("Agent runner not found");
  });
});

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

  it("keeps an error apart from the reply it interrupts", () => {
    startTurn();
    handleChatEvent({ type: "chat_event", event: "text_delta", text: "| 1 |" });
    handleChatEvent({
      type: "chat_event",
      event: "error",
      providerId: "claude",
      message: "Connection reset",
    });

    expect(contents().at(-1)).toBe("| 1 |");
    expect(lastError()).toContain("Connection reset");
  });

  it("keeps a turn that only produced an error", () => {
    startTurn();
    handleChatEvent({
      type: "chat_event",
      event: "error",
      providerId: "claude",
      message: "Connection reset",
    });

    expect(useChatStore.getState().messages.at(-1)?.role).toBe("assistant");
    expect(lastError()).toContain("Connection reset");
  });

  it("shows an error's own text as written, not as Markdown", () => {
    startTurn();
    handleChatEvent({
      type: "chat_event",
      event: "error",
      providerId: "claude",
      message: "EACCES: C:\\Users\\me\\.socadb",
    });

    expect(lastError()).toContain(escapeMarkdown("C:\\Users\\me\\.socadb"));
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

    const reply = lastError() ?? "";
    expect(reply).toContain("GPT-6 Sol");
    expect(reply).toContain("isn't available with your ChatGPT plan");
  });

  describe("tool results", () => {
    function toolResult(output: unknown) {
      startTurn();
      handleChatEvent({
        type: "chat_event",
        event: "tool_use",
        toolName: "mcp__socadb__create_table",
        toolInput: { name: "products" },
        toolUseId: "t1",
      });
      handleChatEvent({
        type: "chat_event",
        event: "tool_result",
        toolUseId: "t1",
        output,
      });
      return useChatStore.getState().messages.at(-1)?.toolCalls[0]?.result;
    }

    it("shows the text of an MCP result, not its content blocks", () => {
      const result = toolResult([
        { type: "text", text: 'Table "products" created' },
        { type: "text", text: "SocaDB 1.0.1 is available." },
      ]);
      expect(result).toBe('Table "products" created\nSocaDB 1.0.1 is available.');
    });

    it("shows a text result as it came", () => {
      expect(toolResult("Table not found")).toBe("Table not found");
    });

    it("shows a tool cut off by Stop as interrupted, without the CLI's stand-in text", () => {
      startTurn();
      handleChatEvent({
        type: "chat_event",
        event: "tool_use",
        toolName: "mcp__socadb__update_column",
        toolInput: { table: "users", column: "email" },
        toolUseId: "t1",
      });
      handleChatEvent({
        type: "chat_event",
        event: "tool_result",
        toolUseId: "t1",
        output: "[Request interrupted by user for tool use]",
        isError: true,
        interrupted: true,
      });
      expect(useChatStore.getState().messages.at(-1)?.toolCalls[0]).toMatchObject({
        result: "",
        isSuccess: false,
        interrupted: true,
      });
    });

    it("falls back to JSON for a result with no text", () => {
      expect(toolResult([{ type: "image", data: "iVBOR" }])).toBe(
        '[{"type":"image","data":"iVBOR"}]',
      );
    });
  });
});
