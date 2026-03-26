#!/usr/bin/env node
import { createInterface } from "readline";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { platform, arch } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getMcpBinaryPath(): string {
  const os = platform() === "darwin" ? "darwin" : platform() === "win32" ? "windows" : "linux";
  const cpu = arch() === "arm64" ? "arm64" : arch();
  const ext = os === "windows" ? ".exe" : "";
  const binaryName = `socadb-mcp-${os}-${cpu}${ext}`;
  const distPath = join(__dirname, "..", "dist", binaryName);
  if (existsSync(distPath)) return distPath;
  return join(__dirname, "..", "dist", "socadb-mcp");
}

interface ChatSendCommand {
  type: "chat_send";
  message: string;
  systemPrompt: string;
  sessionId?: string;
  model?: string;
}

interface ChatStopCommand {
  type: "chat_stop";
}

interface ChatStatusCommand {
  type: "chat_status" | "chat_init";
}

type Command = ChatSendCommand | ChatStopCommand | ChatStatusCommand;

function emit(event: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleChatSend(cmd: ChatSendCommand) {
  abortController = new AbortController();
  console.error("[codex-agent] handleChatSend", cmd.message.slice(0, 50));

  try {
    const { Codex } = await import("@openai/codex-sdk");

    const codex = new Codex({
      config: {
        developer_instructions: cmd.systemPrompt,
        mcp_servers: {
          socadb: {
            command: getMcpBinaryPath(),
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

function handleChatStop() {
  if (abortController) {
    abortController.abort();
  }
}

async function handleChatStatus() {
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
          loggedIn: true,
          email: null,
          loginType: "subscription",
        });
        return;
      }
    }

    emit({
      type: "chat_status_result",
      loggedIn: false,
      email: null,
      loginType: null,
    });
  } catch {
    emit({
      type: "chat_status_result",
      loggedIn: false,
      email: null,
      loginType: null,
    });
  }
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  try {
    const cmd = JSON.parse(line) as Command;

    switch (cmd.type) {
      case "chat_send":
        void handleChatSend(cmd);
        break;
      case "chat_stop":
        handleChatStop();
        break;
      case "chat_status":
      case "chat_init":
        void handleChatStatus();
        break;
    }
  } catch {
    emit({ type: "chat_event", event: "error", message: "Invalid command" });
  }
});

rl.on("close", () => {
  process.exit(0);
});

emit({ type: "ready" });
