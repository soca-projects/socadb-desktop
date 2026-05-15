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
      model: cmd.model ?? "gpt-5.5",
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

    // Don't pin a model: some models only work on API-key accounts, not
    // ChatGPT subscriptions, and the SDK reports an error event we'd misread
    // as "not logged in". Letting the binary pick its default gives us a
    // true auth check.
    const thread = codex.startThread({
      skipGitRepoCheck: true,
      modelReasoningEffort: "low",
    });

    const { events } = await thread.runStreamed("what is 2+2?", {
      signal: abortCtrl.signal,
    });

    for await (const event of events) {
      if (event.type === "error") {
        // Log the real error so it surfaces in stderr / chat_diagnose instead
        // of silently being reported as "not logged in".
        console.error("[codex-status] error event:", event.message);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[codex-status] caught:", message);
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
