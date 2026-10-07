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
  emitDone,
  emitError,
  getAgentWorkDir,
  getClaudeCodeBinaryPath,
  getClaudeSdkOptions,
  errorText,
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

interface TurnState {
  started: boolean;
  sessionId?: string;
}

async function handleSend(cmd: ChatSendCommand) {
  const controller = new AbortController();
  abortController = controller;
  // One runner serves every conversation: a turn only reports its own session,
  // even when it is stopped before the CLI announces one.
  const turn: TurnState = { started: false, sessionId: cmd.sessionId };

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
      abortController: controller,
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

    try {
      await runTurn(cmd.message, options, controller, turn);
    } catch (error) {
      // A session the CLI can't load fails before it starts. Keeping it would fail
      // every later message of the conversation, so start over without it.
      if (!options.resume || turn.started || controller.signal.aborted) throw error;
      console.error("[agent] resume failed:", errorText(error));
      emit({ type: "chat_event", event: "memory_lost" });
      delete options.resume;
      await runTurn(cmd.message, options, controller, turn);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      emitDone("", turn.sessionId);
      return;
    }
    const errorMessage = errorText(error);
    console.error("[agent] error:", errorMessage);
    emitError("claude", errorMessage);
  } finally {
    currentQuery = undefined;
    abortController = undefined;
  }
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
  turn: TurnState,
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
        "auth",
      );
      return;
    }

    if (message.type === "system" && message.subtype === "init") {
      turn.started = true;
      turn.sessionId = (message as Record<string, unknown>).session_id as string;
      emit({
        type: "chat_event",
        event: "session_init",
        sessionId: turn.sessionId,
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

  emitDone(finalResponse, turn.sessionId);
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
