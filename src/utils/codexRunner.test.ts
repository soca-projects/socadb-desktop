import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../mcp-server/src/codex-exec", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mcp-server/src/codex-exec")>()),
  runCodexExec,
}));
vi.mock("../../mcp-server/src/agent-runner-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mcp-server/src/agent-runner-shared")>()),
  startRunner: vi.fn(),
  emit: vi.fn(),
  emitDone: vi.fn(),
  emitError: vi.fn(),
  agentRuntimeDir: () => "/tmp/runtime",
  getMcpBinaryPath: () => "/tmp/mcp",
}));

const { runCodexExec } = vi.hoisted(() => ({
  runCodexExec: vi.fn(),
}));

import {
  emit,
  emitDone,
  startRunner,
  type ChatSendCommand,
} from "../../mcp-server/src/agent-runner-shared";
import "../../mcp-server/src/agent-runner-codex";

const handlers = vi.mocked(startRunner).mock.calls[0]?.[0];
if (!handlers) throw new Error("the runner didn't start");
const { handleSend } = handlers;

async function* answer() {
  yield { type: "thread.started", thread_id: "thread-1" };
  yield { type: "item.completed", item: { type: "agent_message", text: "Done" } };
}

function send(cmd: Partial<ChatSendCommand>) {
  return handleSend({
    type: "chat_send",
    message: "Add a users table",
    systemPrompt: "Schema: 3 tables",
    ...cmd,
  });
}

function lastCall(): { args: string[]; input: string } {
  const call = runCodexExec.mock.calls.at(-1);
  if (!call) throw new Error("codex didn't run");
  return { args: call[1], input: call[2] };
}

describe("Codex runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCodexExec.mockImplementation(answer);
  });

  it("keeps the command line the same size whatever the schema", async () => {
    await send({ systemPrompt: "small" });
    const small = lastCall().args.join(" ").length;
    await send({ systemPrompt: "- table_name (3 cols: id, name, note)\n".repeat(2000) });
    expect(lastCall().args.join(" ").length).toBe(small);
  });

  it("sends the schema and the message together", async () => {
    await send({});
    const { input } = lastCall();
    expect(input).toContain("Schema: 3 tables");
    expect(input).toContain("Add a users table");
    expect(input.indexOf("Schema: 3 tables")).toBeLessThan(
      input.indexOf("Add a users table"),
    );
  });

  it("gives a resumed thread the schema as it is now", async () => {
    await send({ sessionId: "thread-1", systemPrompt: "Schema: 4 tables" });
    const { args, input } = lastCall();
    expect(args.slice(-2)).toEqual(["resume", "thread-1"]);
    expect(input).toContain("Schema: 4 tables");
    expect(emitDone).toHaveBeenCalledWith("Done", "thread-1");
  });

  it("keeps every message of a turn, not only the last one", async () => {
    runCodexExec.mockImplementation(async function* () {
      yield { type: "thread.started", thread_id: "thread-1" };
      yield {
        type: "item.completed",
        item: { type: "agent_message", text: "Creating it." },
      };
      yield { type: "item.completed", item: { type: "agent_message", text: "Created." } };
    });

    await send({});

    expect(emitDone).toHaveBeenCalledWith("Creating it.\n\nCreated.", "thread-1");
  });

  describe("a failed tool call", () => {
    function failedCall(item: object) {
      runCodexExec.mockImplementation(async function* () {
        yield { type: "thread.started", thread_id: "thread-1" };
        yield {
          type: "item.completed",
          item: { id: "t1", type: "mcp_tool_call", status: "failed", ...item },
        };
      });
      return send({});
    }

    function toolResult() {
      return vi.mocked(emit).mock.calls.find(([e]) => e.event === "tool_result")?.[0];
    }

    it("passes on what the tool answered", async () => {
      const content = [{ type: "text", text: 'Table "x" not found' }];
      await failedCall({ result: { content }, error: null });
      expect(toolResult()).toMatchObject({ output: content, isError: true });
    });

    it("passes on why the tool couldn't be reached", async () => {
      await failedCall({ error: { message: "request timed out" } });
      expect(toolResult()).toMatchObject({ output: "request timed out", isError: true });
    });
  });
});
