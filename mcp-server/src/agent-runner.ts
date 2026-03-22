#!/usr/bin/env node
import { query, listSessions, type Options, type Query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "readline";

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

let currentQuery: Query | undefined;
let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleChatSend(cmd: ChatSendCommand) {
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
      allowedTools: ["mcp__socadb"],
      permissionMode: "bypassPermissions" as const,
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
    emit({
      type: "chat_event",
      event: "error",
      message: errorMessage,
    });
  } finally {
    currentQuery = undefined;
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

    if (info.tokenSource && info.tokenSource !== "") {
      loggedIn = true;
      loginType = "subscription";
    }

    if (info.subscriptionType && info.subscriptionType !== "") {
      loggedIn = true;
      loginType = "subscription";
    }

    emit({
      type: "chat_status_result",
      loggedIn,
      email: info.email ?? null,
      loginType: loginType ?? null,
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
