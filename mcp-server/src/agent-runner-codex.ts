#!/usr/bin/env node
import {
  CODEX_EFFORTS,
  emit,
  emitError,
  getMcpBinaryPath,
  getModuleDir,
  startRunner,
  type ChatSendCommand,
  type CodexEffort,
} from "./agent-runner-shared.ts";

const __dirname = getModuleDir(import.meta.url);

let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleSend(cmd: ChatSendCommand) {
  abortController = new AbortController();

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
      model: cmd.model ?? "gpt-5.5",
      skipGitRepoCheck: true,
      webSearchEnabled: true,
      sandboxMode: "danger-full-access" as const,
      approvalPolicy: "never" as const,
      modelReasoningEffort: effort,
    };

    const thread = cmd.sessionId
      ? codex.resumeThread(cmd.sessionId, threadOptions)
      : codex.startThread(threadOptions);

    const { events } = await thread.runStreamed(cmd.message, {
      signal: abortController.signal,
    });

    let finalResponse = "";

    for await (const event of events) {
      switch (event.type) {
        case "thread.started":
          currentSessionId = event.thread_id;
          emit({
            type: "chat_event",
            event: "session_init",
            sessionId: currentSessionId,
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
              output:
                item.status === "failed"
                  ? item.error?.message
                  : item.result?.content,
              isError: item.status === "failed",
            });
          }
          break;
        }

        case "error":
          emitError("codex", event.message);
          break;
      }
    }

    emit({
      type: "chat_event",
      event: "done",
      response: finalResponse,
      sessionId: currentSessionId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[codex-agent] error:", errorMessage);
    emitError("codex", errorMessage);
  } finally {
    abortController = undefined;
  }
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
