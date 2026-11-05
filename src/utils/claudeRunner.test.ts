import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// By path: the bare name would resolve from this folder, not from the runner's.
vi.mock("../../mcp-server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs", () => ({
  query,
  listSessions: vi.fn(() => Promise.resolve([])),
  importSessionToStore: vi.fn(),
}));
vi.mock("../../mcp-server/src/claude-session-store", () => ({
  FileSessionStore: class {
    has = sessionHas;
  },
}));
vi.mock("../../mcp-server/src/agent-runner-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mcp-server/src/agent-runner-shared")>()),
  startRunner: vi.fn(),
  emit: vi.fn(),
  emitDone: vi.fn(),
  emitError: vi.fn(),
  getAgentWorkDir: () => "/tmp/agent",
  getClaudeCodeBinaryPath: () => undefined,
  getClaudeSessionsDir: () => "/tmp/sessions",
  getMcpBinaryPath: () => "/tmp/mcp",
}));

const { query, sessionHas } = vi.hoisted(() => ({
  query: vi.fn(),
  sessionHas: vi.fn(() => Promise.resolve(true)),
}));

import {
  emit,
  emitDone,
  emitError,
  startRunner,
  type ChatSendCommand,
} from "../../mcp-server/src/agent-runner-shared";
import "../../mcp-server/src/agent-runner-claude";
import { INTERRUPT_GRACE_MS } from "../../mcp-server/src/claude-stop";

const handlers = vi.mocked(startRunner).mock.calls[0]?.[0];
if (!handlers) throw new Error("the runner didn't start");
const { handleSend, handleStop } = handlers;
const interruptError = new Error(
  "Claude Code returned an error result: [ede_diagnostic]",
);

type Step = { message: unknown } | { fail: Error } | "end";

function fakeCli() {
  const steps: Step[] = [];
  let wake: () => void = vi.fn();
  const push = (step: Step) => {
    steps.push(step);
    wake();
  };
  async function* stream() {
    for (;;) {
      if (steps.length === 0) await new Promise<void>((resolve) => (wake = resolve));
      const step = steps.shift();
      if (!step || step === "end") return;
      if ("fail" in step) throw step.fail;
      yield step.message;
    }
  }
  const iterator = stream();
  const interrupt = vi.fn(() => {
    push({ fail: interruptError });
    return Promise.resolve();
  });
  query.mockReturnValue(Object.assign(iterator, { interrupt }));
  return { push, interrupt };
}

const send: ChatSendCommand = { type: "chat_send", message: "hi", systemPrompt: "" };
const textDelta = (text: string) => ({
  message: {
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text } },
  },
});
const init = (id: string) => ({
  message: { type: "system", subtype: "init", session_id: id },
});
const toolUse = (id: string) => ({
  message: {
    type: "assistant",
    message: { content: [{ type: "tool_use", id, name: "get_table", input: {} }] },
  },
});
const toolResult = (id: string) => ({
  message: {
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: id, content: "cancelled" }],
    },
  },
});
const assistantText = (text: string) => ({
  message: { type: "assistant", message: { content: [{ type: "text", text }] } },
});
const flush = () => vi.advanceTimersByTimeAsync(0);
const emitted = (event: string) =>
  vi
    .mocked(emit)
    .mock.calls.filter(([e]) => e.event === event)
    .map(([e]) => e);

describe("the Claude runner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionHas.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows nothing more after Stop and keeps the text shown so far", async () => {
    const cli = fakeCli();
    const running = handleSend(send);
    cli.push(assistantText("complete block"));
    cli.push(textDelta("before"));
    await flush();

    cli.interrupt.mockImplementation(() => Promise.resolve());
    handleStop();
    cli.push(textDelta("after"));
    cli.push({ fail: interruptError });
    await running;

    expect(cli.interrupt).toHaveBeenCalledTimes(1);
    expect(emitted("text_delta").map((e) => e.text)).toEqual(["before"]);
    expect(emitDone).toHaveBeenCalledTimes(1);
    expect(emitDone).toHaveBeenCalledWith("", undefined);
    expect(emitError).not.toHaveBeenCalled();
  });

  it("keeps the text shown when a stopped turn still ends normally", async () => {
    const cli = fakeCli();
    const running = handleSend(send);
    cli.push(assistantText("complete block"));
    await flush();

    cli.interrupt.mockImplementation(() => Promise.resolve());
    handleStop();
    cli.push("end");
    await running;

    expect(emitDone).toHaveBeenCalledWith("", undefined);
  });

  it("settles a tool cut off by Stop but starts no new one", async () => {
    const cli = fakeCli();
    cli.interrupt.mockImplementation(() => Promise.resolve());
    const running = handleSend(send);
    cli.push(toolUse("running"));
    await flush();

    handleStop();
    cli.push(toolResult("running"));
    cli.push(toolUse("later"));
    cli.push("end");
    await running;

    expect(emitted("tool_use").map((e) => e.toolUseId)).toEqual(["running"]);
    expect(emitted("tool_result").map((e) => e.toolUseId)).toEqual(["running"]);
  });

  it("still reports the session of a turn stopped as it starts", async () => {
    const cli = fakeCli();
    cli.interrupt.mockImplementation(() => Promise.resolve());
    const running = handleSend(send);
    await flush();

    handleStop();
    cli.push(init("session-1"));
    cli.push({ fail: interruptError });
    await running;

    expect(emitted("session_init").map((e) => e.sessionId)).toEqual(["session-1"]);
    expect(emitDone).toHaveBeenCalledWith("", "session-1");
  });

  it("doesn't start the CLI when Stop comes while the session is checked", async () => {
    let found: (value: boolean) => void = vi.fn();
    sessionHas.mockReturnValue(new Promise((resolve) => (found = resolve)));
    fakeCli();
    const running = handleSend({ ...send, sessionId: "session-1" });
    await flush();

    handleStop();
    found(true);
    await running;

    expect(query).not.toHaveBeenCalled();
    expect(emitDone).toHaveBeenCalledTimes(1);
    expect(emitDone).toHaveBeenCalledWith("", "session-1");
  });

  it("doesn't retry without the session when a resumed turn is stopped", async () => {
    const cli = fakeCli();
    cli.interrupt.mockImplementation(() => Promise.resolve());
    const running = handleSend({ ...send, sessionId: "session-1" });
    await flush();

    handleStop();
    cli.push({ fail: interruptError });
    await running;

    expect(query).toHaveBeenCalledTimes(1);
    expect(emitted("memory_lost")).toEqual([]);
    expect(emitDone).toHaveBeenCalledWith("", "session-1");
  });

  it("drops the fallback once a stopped turn has ended", async () => {
    const cli = fakeCli();
    cli.interrupt.mockImplementation(() => Promise.resolve());
    const running = handleSend(send);
    await flush();

    handleStop();
    cli.push("end");
    await running;
    await vi.advanceTimersByTimeAsync(INTERRUPT_GRACE_MS);

    const options = query.mock.calls[0]?.[0]?.options;
    expect(options?.abortController.signal.aborted).toBe(false);
  });

  it("reports the full reply of a turn left to finish", async () => {
    const cli = fakeCli();
    const running = handleSend(send);
    cli.push(assistantText("the whole reply"));
    cli.push("end");
    await running;

    expect(emitDone).toHaveBeenCalledWith("the whole reply", undefined);
  });

  it("reports the error of a turn nobody stopped", async () => {
    const cli = fakeCli();
    const running = handleSend(send);
    cli.push({ fail: new Error("overloaded") });
    await running;

    expect(emitError).toHaveBeenCalledWith("claude", "overloaded");
    expect(emitDone).not.toHaveBeenCalled();
  });

  it("does nothing on Stop when no turn runs", () => {
    expect(() => handleStop()).not.toThrow();
    expect(emitDone).not.toHaveBeenCalled();
  });
});
