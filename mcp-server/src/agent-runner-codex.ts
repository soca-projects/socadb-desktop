#!/usr/bin/env node
import type { Thread } from "@openai/codex-sdk";
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
  thread: Thread;
  started: boolean;
  lastError?: string;
}

function reportError(raw: string, model: string | undefined) {
  emitError("codex", codexErrorText(raw), codexErrorCode(raw), model);
}

async function handleSend(cmd: ChatSendCommand) {
  const controller = new AbortController();
  abortController = controller;
  let turn: TurnState | undefined;

  try {
    const { Codex } = await import("@openai/codex-sdk");
    const effort: CodexEffort =
      cmd.effort && CODEX_EFFORTS.includes(cmd.effort as CodexEffort)
        ? (cmd.effort as CodexEffort)
        : "medium";

    const codex = new Codex({
      config: {
        developer_instructions: cmd.systemPrompt,
        mcp_servers: {
          socadb: {
            command: getMcpBinaryPath(__dirname),
            args: [],
            env: {},
          },
        },
      },
    });

    const threadOptions = {
      model: cmd.model ?? "gpt-6-sol",
      skipGitRepoCheck: true,
      webSearchEnabled: true,
      sandboxMode: "danger-full-access" as const,
      approvalPolicy: "never" as const,
      modelReasoningEffort: effort,
    };

    turn = {
      thread: cmd.sessionId
        ? codex.resumeThread(cmd.sessionId, threadOptions)
        : codex.startThread(threadOptions),
      started: false,
    };
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
      turn = { thread: codex.startThread(threadOptions), started: false };
      await runTurn(cmd, controller, turn);
    }
  } catch (error) {
    const raw = turn?.lastError ?? errorText(error);
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
  const { events } = await turn.thread.runStreamed(cmd.message, {
    signal: controller.signal,
  });

  let finalResponse = "";

  for await (const event of events) {
    switch (event.type) {
      case "thread.started":
        turn.started = true;
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

  emitDone(finalResponse, turn.thread.id);
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
