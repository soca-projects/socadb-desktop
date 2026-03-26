#!/usr/bin/env node
import {
  emit,
  getMcpBinaryPath,
  getModuleDir,
  startRunner,
  type ChatSendCommand,
} from "./agent-runner-shared.ts";

const __dirname = getModuleDir(import.meta.url);

let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleSend(cmd: ChatSendCommand) {
  abortController = new AbortController();
  console.error("[codex-agent] handleChatSend", cmd.message.slice(0, 50));

  try {
    const { Codex } = await import("@openai/codex-sdk");

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
      model: cmd.model ?? "gpt-5.3-codex",
      skipGitRepoCheck: true,
      webSearchEnabled: true,
      sandboxMode: "danger-full-access" as const,
      approvalPolicy: "never" as const,
      modelReasoningEffort: "low" as const,
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
          emit({
            type: "chat_event",
            event: "error",
            message: event.message,
            providerId: "codex",
          });
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
    emit({
      type: "chat_event",
      event: "error",
      message: errorMessage,
      providerId: "codex",
    });
  } finally {
    abortController = undefined;
  }
}

function handleStop() {
  if (abortController) {
    abortController.abort();
  }
}

async function handleStatus() {
  try {
    const { Codex } = await import("@openai/codex-sdk");
    const codex = new Codex();
    const abortCtrl = new AbortController();

    const thread = codex.startThread({
      model: "gpt-5.2-codex",
      skipGitRepoCheck: true,
      modelReasoningEffort: "low",
    });

    const { events } = await thread.runStreamed("what is 2+2?", {
      signal: abortCtrl.signal,
    });

    for await (const event of events) {
      if (event.type === "error") {
        abortCtrl.abort();
        emit({
          type: "chat_status_result",
          providerId: "codex",
          loggedIn: false,
          email: null,
          loginType: null,
        });
        return;
      }
      if (event.type === "item.completed") {
        abortCtrl.abort();
        emit({
          type: "chat_status_result",
          providerId: "codex",
          loggedIn: true,
          email: null,
          loginType: "subscription",
        });
        return;
      }
    }

    emit({
      type: "chat_status_result",
      providerId: "codex",
      loggedIn: false,
      email: null,
      loginType: null,
    });
  } catch {
    emit({
      type: "chat_status_result",
      providerId: "codex",
      loggedIn: false,
      email: null,
      loginType: null,
    });
  }
}

startRunner({
  handleSend,
  handleStop,
  handleStatus,
});
