import { describe, expect, it, vi } from "vitest";

vi.mock("fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("fs")>()),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0 })),
  appendFileSync,
}));

const { appendFileSync } = vi.hoisted(() => ({ appendFileSync: vi.fn() }));

import { mcpLog } from "../../mcp-server/src/log";

function written(): string {
  return String(appendFileSync.mock.lastCall?.[1]);
}

describe("mcpLog", () => {
  it("masks an API key", () => {
    mcpLog.warn(
      "agent.turn.error",
      "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 end",
    );
    expect(written()).toContain("key sk-[redacted] end");
  });

  it("masks a key the service already masked", () => {
    mcpLog.warn(
      "agent.turn.error",
      "Incorrect API key provided: sk-proj-*************test. You can find your API key",
    );
    expect(written()).toContain("provided: sk-[redacted] You can find");
    expect(written()).not.toContain("test");
  });

  it("keeps ordinary words that contain a prefix", () => {
    mcpLog.info("agent.turn.error", "task-list sk-short");
    expect(written()).toContain("task-list sk-short");
  });
});
