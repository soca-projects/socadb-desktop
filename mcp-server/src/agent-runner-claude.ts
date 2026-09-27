#!/usr/bin/env node
import {
  importSessionToStore,
  listSessions,
  query,
  type Options,
  type Query,
} from "@anthropic-ai/claude-agent-sdk";
import { FileSessionStore } from "./claude-session-store.ts";
import {
  CLAUDE_EFFORTS,
  emit,
  emitError,
  getAgentWorkDir,
  getClaudeCodeBinaryPath,
  getClaudeSdkOptions,
  getClaudeSessionsDir,
  getMcpBinaryPath,
  getModuleDir,
  startRunner,
  type ChatSendCommand,
  type ClaudeEffort,
} from "./agent-runner-shared.ts";

const __dirname = getModuleDir(import.meta.url);
const sdkOptions = getClaudeSdkOptions();
const claudeCodePath = getClaudeCodeBinaryPath(__dirname);
const sessionStore = new FileSessionStore(getClaudeSessionsDir());

let currentQuery: Query | undefined;
let abortController: AbortController | undefined;
let currentSessionId: string | undefined;

async function handleSend(cmd: ChatSendCommand) {
  abortController = new AbortController();

  try {
    const effort =
      cmd.effort && CLAUDE_EFFORTS.includes(cmd.effort as ClaudeEffort)
        ? (cmd.effort as ClaudeEffort)
        : undefined;

    const options: Options = {
      ...sdkOptions,
      ...(claudeCodePath ? { pathToClaudeCodeExecutable: claudeCodePath } : {}),
      model: cmd.model,
      cwd: getAgentWorkDir(),
      ...(effort !== undefined ? { effort } : {}),
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: cmd.systemPrompt,
        // The append carries the live schema; a recorded prompt would go stale on resume.
        snapshot: false,
      },
      abortController,
      maxTurns: 500,
      allowedTools: ["mcp__socadb", "WebSearch", "WebFetch"],
      permissionMode: "bypassPermissions" as const,
      // Keep the user's own Claude Code setup (hooks, plugins, MCP servers,
      // CLAUDE.md) out of SocaDB's agent.
      settingSources: [],
      strictMcpConfig: true,
      // Auto-memory is shared by every session of the cwd: the agent must only
      // remember its own conversation, and forget it when that is deleted.
      settings: { autoMemoryEnabled: false },
      includePartialMessages: true,
      sessionStore,
      mcpServers: {
        socadb: {
          command: getMcpBinaryPath(__dirname),
          args: [],
          env: {},
        },
      },
    };

    if (cmd.sessionId) {
      if (await canResume(cmd.sessionId)) options.resume = cmd.sessionId;
      else emit({ type: "chat_event", event: "memory_lost" });
    }

    const turn = { started: false };
    try {
      await runTurn(cmd.message, options, abortController, turn);
    } catch (error) {
      // A session the CLI can't load fails before it starts. Keeping it would fail
      // every later message of the conversation, so start over without it.
      if (!options.resume || turn.started || abortController.signal.aborted) throw error;
      console.error("[agent] resume failed:", errorText(error));
      emit({ type: "chat_event", event: "memory_lost" });
      delete options.resume;
      await runTurn(cmd.message, options, abortController, turn);
    }
  } catch (error) {
    const errorMessage = errorText(error);
    console.error("[agent] error:", errorMessage);
    emitError("claude", errorMessage);
  } finally {
    currentQuery = undefined;
    abortController = undefined;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function canResume(sessionId: string): Promise<boolean> {
  try {
    if (await sessionStore.has(sessionId)) return true;
    const found = (await listSessions()).find((s) => s.sessionId === sessionId);
    if (!found) return false;
    await importSessionToStore(sessionId, sessionStore, { dir: found.cwd });
    return true;
  } catch (error) {
    console.error("[agent] session import failed:", errorText(error));
    return false;
  }
}

async function runTurn(
  prompt: string,
  options: Options,
  controller: AbortController,
  turn: { started: boolean },
) {
  currentQuery = query({ prompt, options });

  let finalResponse = "";

  for await (const message of currentQuery) {
    // The CLI retries a rejected key 10 times (~3 min); the first retry says why.
    if (
      message.type === "system" &&
      message.subtype === "api_retry" &&
      message.error === "authentication_failed"
    ) {
      controller.abort();
      emitError(
        "claude",
        `API Error: ${message.error_status ?? 401} authentication failed`,
        true,
      );
      return;
    }

    if (message.type === "system" && message.subtype === "init") {
      turn.started = true;
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
        if (typeof content === "string") continue;
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
