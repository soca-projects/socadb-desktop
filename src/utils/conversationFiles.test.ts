import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
const readTextFile = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => readTextFile(...args),
}));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: () => Promise.resolve("/home/u"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));

import {
  migrateLegacyConversations,
  parseConversationFile,
  providerFromSessionId,
  serializeConversation,
} from "./conversationFiles";
import type { Conversation } from "../types/chat";

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  name: "Tables",
  sessionId: null,
  messages: [
    {
      id: "m1",
      role: "user",
      content: "hi",
      toolCalls: [],
      timestamp: "2026-09-27T10:00:00Z",
    },
  ],
  createdAt: "2026-09-27T10:00:00Z",
  updatedAt: "2026-09-27T10:00:00Z",
  ...over,
});

describe("providerFromSessionId", () => {
  it("reads the UUID version: v4 is Claude, v7 is Codex", () => {
    expect(providerFromSessionId("325a9f58-32b8-4c24-b59e-a629f854add5")).toBe("claude");
    expect(providerFromSessionId("01a0df46-ef49-77a3-8806-8097a762e178")).toBe("codex");
    expect(providerFromSessionId(null)).toBeUndefined();
    expect(providerFromSessionId("not-a-uuid")).toBeUndefined();
  });
});

describe("conversation files", () => {
  it("round-trips a conversation", () => {
    const c = conv({ provider: "claude", model: "claude-sonnet-5" });
    expect(parseConversationFile(serializeConversation(c))).toEqual(c);
  });

  it("rejects files that are not conversations", () => {
    expect(parseConversationFile("{")).toBeNull();
    expect(parseConversationFile(JSON.stringify({ version: 1, id: "x" }))).toBeNull();
  });
});

describe("migrateLegacyConversations", () => {
  beforeEach(() => {
    invoke.mockReset();
    readTextFile.mockReset();
  });

  it("writes each valid legacy conversation to its own file, then retires the legacy file", async () => {
    const legacy = conv({ sessionId: "325a9f58-32b8-4c24-b59e-a629f854add5" });
    const empty = conv({ id: "c2", messages: [] });
    readTextFile.mockResolvedValue(
      JSON.stringify({ conversations: [legacy, empty, { broken: true }] }),
    );
    await migrateLegacyConversations();
    const writes = invoke.mock.calls.filter(([cmd]) => cmd === "conversation_write");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].content).provider).toBe("claude");
    expect(invoke).toHaveBeenLastCalledWith("conversation_retire_legacy");
  });

  it("does nothing when there is no legacy file", async () => {
    readTextFile.mockRejectedValue(new Error("not found"));
    await migrateLegacyConversations();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps the legacy file when it cannot be parsed", async () => {
    readTextFile.mockResolvedValue("{ truncated");
    await migrateLegacyConversations();
    expect(invoke).not.toHaveBeenCalled();
  });
});
