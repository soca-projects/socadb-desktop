import { describe, it, expect, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { useChatStore } from "../stores/chatStore";
import { stopAllAgents } from "./chatCommands";

describe("stopAllAgents", () => {
  it("stops both agents and ends the turn one was streaming", async () => {
    useChatStore.setState({
      isStreaming: true,
      streamingConversationId: "conversation",
      sessionId: "session",
      messages: [],
    });
    await stopAllAgents();
    expect(invoke).toHaveBeenCalledWith("chat_reset", { providerId: "claude" });
    expect(invoke).toHaveBeenCalledWith("chat_reset", { providerId: "codex" });
    expect(useChatStore.getState()).toMatchObject({
      isStreaming: false,
      streamingConversationId: null,
      sessionId: "session",
    });
  });
});
