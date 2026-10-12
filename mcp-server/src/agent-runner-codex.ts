#!/usr/bin/env node
import { CODEX_DISABLED_FEATURES, runCodexExec } from "./codex-exec.ts";
import {
  CODEX_EFFORTS,
  codexErrorCode,
  codexErrorText,
  emit,
  emitDone,
  emitError,
  errorText,
  getMcpBinaryPath,
  getModuleDir,
  isAuthErrorMessage,
  isReconnectNotice,
  startRunner,
  type ChatSendCommand,
  type CodexEffort,
} from "./agent-runner-shared.ts";

const __dirname = getModuleDir(import.meta.url);

let abortController: AbortController | undefined;

interface TurnState {
  threadId?: string;
  started: boolean;
  lastError?: string;
}

function codexArgs(cmd: ChatSendCommand, threadId: string | undefined): string[] {
  const effort: CodexEffort =
    cmd.effort && CODEX_EFFORTS.includes(cmd.effort as CodexEffort)
      ? (cmd.effort as CodexEffort)
      : "medium";
  return [
    "--config",
    `developer_instructions=${JSON.stringify(cmd.systemPrompt)}`,
    "--config",
    `mcp_servers.socadb.command=${JSON.stringify(getMcpBinaryPath(__dirname))}`,
    "--config",
    "mcp_servers.socadb.args=[]",
    "--config",
    "mcp_servers.socadb.env={}",
    // SocaDB's own tools are the agent's job; under a read-only sandbox codex would
    // otherwise ask for an approval nobody can give.
    "--config",
    'mcp_servers.socadb.default_tools_approval_mode="approve"',
    "--model",
    cmd.model ?? "gpt-6-sol",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--config",
    `model_reasoning_effort="${effort}"`,
    "--config",
    'web_search="live"',
    "--config",
    'approval_policy="never"',
    ...CODEX_DISABLED_FEATURES.flatMap((feature) => ["--disable", feature]),
    ...(threadId ? ["resume", threadId] : []),
  ];
}

function reportError(raw: string, model: string | undefined) {
  emitError("codex", codexErrorText(raw), codexErrorCode(raw), model);
}

async function handleSend(cmd: ChatSendCommand) {
  const controller = new AbortController();
  abortController = controller;
  const turn: TurnState = { threadId: cmd.sessionId, started: false };

  try {
    try {
      await runTurn(cmd, controller, turn);
    } catch (error) {
      // A thread codex can't find fails before it starts. Keeping its id would
      // fail every later message of the conversation, so start over without it.
      const raw = errorText(error);
      const resumeFailed =
        cmd.sessionId &&
        !turn.started &&
        !controller.signal.aborted &&
        !isAuthErrorMessage(raw);
      if (!resumeFailed) throw error;
      console.error("[codex-agent] resume failed:", codexErrorText(raw));
      emit({ type: "chat_event", event: "memory_lost" });
      turn.threadId = undefined;
      turn.lastError = undefined;
      await runTurn(cmd, controller, turn);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      emitDone("", turn.threadId);
      return;
    }
    const raw = turn.lastError ?? errorText(error);
    console.error("[codex-agent] error:", raw);
    reportError(raw, cmd.model);
  } finally {
    abortController = undefined;
  }
}

async function runTurn(
  cmd: ChatSendCommand,
  controller: AbortController,
  turn: TurnState,
) {
  const events = runCodexExec(
    codexArgs(cmd, turn.threadId),
    cmd.message,
    controller.signal,
  );

  let finalResponse = "";

  for await (const event of events) {
    switch (event.type) {
      case "thread.started":
        turn.started = true;
        turn.threadId = event.thread_id;
        emit({
          type: "chat_event",
          event: "session_init",
          sessionId: event.thread_id,
        });
        break;

      case "item.started": {
        const item = event.item;
        if (item.type === "mcp_tool_call") {
          emit({
            type: "chat_event",
            event: "tool_use",
            toolName: item.tool,
            toolInput: item.arguments,
            toolUseId: item.id,
          });
        }
        if (item.type === "agent_message") {
          emit({
            type: "chat_event",
            event: "text_delta",
            text: item.text,
          });
        }
        break;
      }

      case "item.completed": {
        const item = event.item;
        if (item.type === "agent_message") {
          finalResponse = item.text;
        }
        if (item.type === "mcp_tool_call") {
          emit({
            type: "chat_event",
            event: "tool_result",
            toolUseId: item.id,
            output: item.status === "failed" ? item.error?.message : item.result?.content,
            isError: item.status === "failed",
          });
        }
        break;
      }

      // Codex reports each retry of a dropped connection as an error event and
      // usually recovers; only the turn failing ends it. A rejected login won't
      // recover, so it is reported at the first retry instead of after all of them.
      case "error":
        if (!isReconnectNotice(event.message)) {
          turn.lastError = event.message;
        } else if (isAuthErrorMessage(event.message)) {
          reportError(event.message, cmd.model);
          return;
        }
        break;

      case "turn.failed":
        reportError(event.error.message, cmd.model);
        return;
    }
  }

  emitDone(finalResponse, turn.threadId);
}

function handleStop() {
  if (abortController) {
    abortController.abort();
  }
}

startRunner({
  handleSend,
  handleStop,
});
