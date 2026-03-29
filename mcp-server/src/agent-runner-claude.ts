#!/usr/bin/env node
import { query, listSessions, type Options, type Query } from "@anthropic-ai/claude-agent-sdk";
import {
  emit,
  getMcpBinaryPath,
  getModuleDir,
  startRunner,
  type ChatSendCommand,
} from "./agent-runner-shared.ts";

const __dirname = getModuleDir(import.meta.url);

let currentQuery: Query | undefined;
let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleSend(cmd: ChatSendCommand) {
  abortController = new AbortController();

  try {
    const options: Options = {
      model: cmd.model,
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: cmd.systemPrompt,
      },
      abortController,
      maxTurns: 500,
      allowedTools: ["mcp__socadb", "WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions" as const,
      includePartialMessages: true,
      mcpServers: {
        socadb: {
          command: getMcpBinaryPath(__dirname),
          args: [],
          env: {},
        },
      },
    };

    if (cmd.sessionId) {
      const sessions = await listSessions();
      const found = sessions.find((s) => s.sessionId === cmd.sessionId);
      if (found) {
        options.resume = cmd.sessionId;
        options.cwd = found.cwd;
      }
    }

    currentQuery = query({
      prompt: cmd.message,
      options,
    });

    let finalResponse = "";

    for await (const message of currentQuery) {
      if (message.type === "system" && message.subtype === "init") {
        currentSessionId = (message as Record<string, unknown>).session_id as string;
        emit({
          type: "chat_event",
          event: "session_init",
          sessionId: currentSessionId,
        });
      }

      if (message.type === "assistant" && message.message?.content) {
        for (const content of message.message.content) {
          if (content.type === "text") {
            finalResponse += content.text;
          }
          if (content.type === "tool_use" && content.name) {
            emit({
              type: "chat_event",
              event: "tool_use",
              toolName: content.name,
              toolInput: content.input,
              toolUseId: content.id,
            });
          }
        }
      }

      if (message.type === "user" && message.message?.content) {
        for (const content of message.message.content) {
          if (content.type === "tool_result" && content.tool_use_id) {
            emit({
              type: "chat_event",
              event: "tool_result",
              toolUseId: content.tool_use_id,
              output: content.content,
              isError: content.is_error || false,
            });
          }
        }
      }

      if (
        message.type === "stream_event" &&
        message.event.type === "content_block_delta" &&
        message.event.delta.type === "text_delta"
      ) {
        emit({
          type: "chat_event",
          event: "text_delta",
          text: message.event.delta.text,
        });
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
    console.error("[agent] error:", errorMessage);
    emit({
      type: "chat_event",
      event: "error",
      message: errorMessage,
      providerId: "claude",
    });
  } finally {
    currentQuery = undefined;
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
    const q = query({
      prompt: "what is 2+2?",
      options: {
        model: "claude-haiku-4-5-20251001",
        maxTurns: 0,
        maxBudgetUsd: 0.00001,
      },
    });

    const info = await q.accountInfo();
    q.return();

    let loggedIn = false;
    let loginType: string | undefined;

    if (info.apiKeySource && info.apiKeySource !== "") {
      loggedIn = true;
      loginType = "api-key";
    }

    const hasSubscription =
      (info.tokenSource && info.tokenSource !== "") ||
      (info.subscriptionType && info.subscriptionType !== "");

    if (hasSubscription && info.email) {
      loggedIn = true;
      loginType = "subscription";
    }

    emit({
      type: "chat_status_result",
      providerId: "claude",
      loggedIn,
      email: info.email ?? null,
      loginType: loginType ?? null,
    });
  } catch {
    emit({
      type: "chat_status_result",
      providerId: "claude",
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
