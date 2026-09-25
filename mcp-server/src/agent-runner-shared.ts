import { createInterface } from "readline";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { platform, arch } from "os";

// Mirror of EffortLevel in src/types/chat.ts. Kept in sync manually because
// mcp-server cannot import from the frontend tree. A test in
// src/types/chat.test.ts enforces parity at build time.
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type CodexEffort = "low" | "medium" | "high" | "xhigh";

export const CLAUDE_EFFORTS: readonly ClaudeEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export const CODEX_EFFORTS: readonly CodexEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

export interface ChatSendCommand {
  type: "chat_send";
  message: string;
  systemPrompt: string;
  sessionId?: string;
  model?: string;
  effort?: EffortLevel;
}

export interface ChatStopCommand {
  type: "chat_stop";
}

export type Command = ChatSendCommand | ChatStopCommand;

export function getModuleDir(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

// Resolves the bundled `claude` CLI binary so we can pass it as
// `pathToClaudeCodeExecutable` and avoid the SDK's implicit PATH lookup.
export function getClaudeCodeBinaryPath(moduleDir: string): string | undefined {
  const npmOs =
    platform() === "darwin"
      ? "darwin"
      : platform() === "win32"
        ? "win32"
        : "linux";
  const cpu = arch() === "arm64" ? "arm64" : "x64";
  const ext = platform() === "win32" ? ".exe" : "";
  const pkgDir = `claude-agent-sdk-${npmOs}-${cpu}`;
  const binary = `claude${ext}`;

  const candidates = [
    join(moduleDir, "node_modules", "@anthropic-ai", pkgDir, binary),
    join(moduleDir, "..", "node_modules", "@anthropic-ai", pkgDir, binary),
    join(moduleDir, "..", "..", "node_modules", "@anthropic-ai", pkgDir, binary),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Logged so a missing binary is diagnosable instead of the SDK's generic
  // "claude not found".
  process.stderr.write(
    `[agent-runner] bundled claude binary not found, falling back to PATH. Searched:\n${candidates.map((c) => `  ${c}`).join("\n")}\n`,
  );
  return undefined;
}

export function getMcpBinaryPath(moduleDir: string): string {
  const os = platform() === "darwin" ? "darwin" : platform() === "win32" ? "windows" : "linux";
  const cpu = arch() === "arm64" ? "arm64" : "x64";
  const ext = os === "windows" ? ".exe" : "";
  const binaryName = `socadb-mcp-${os}-${cpu}${ext}`;

  const candidates = [
    join(moduleDir, binaryName),
    join(moduleDir, `socadb-mcp${ext}`),
    join(moduleDir, "..", "dist", binaryName),
    join(moduleDir, "..", "dist", `socadb-mcp${ext}`),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

// Tells the SDK we run under bun (matches `process.execPath` at runtime, since
// agent-runners are spawned with the bundled bun). Otherwise the SDK defaults
// to "node" and tries to spawn it from PATH on machines that only have our
// bundled runtime.
export function getClaudeSdkOptions(): Record<string, unknown> {
  return { executable: "bun" };
}

export function emit(event: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

const AUTH_ERROR_PATTERN =
  /not logged in|please run \/login|authentication_error|invalid api key|api key is invalid|401 unauthorized/i;

export function isAuthErrorMessage(message: string): boolean {
  return AUTH_ERROR_PATTERN.test(message);
}

export function emitError(providerId: string, message: string, auth = isAuthErrorMessage(message)) {
  emit({
    type: "chat_event",
    event: "error",
    message,
    providerId,
    ...(auth ? { code: "auth" } : {}),
  });
}

export interface RunnerHandlers {
  handleSend: (cmd: ChatSendCommand) => Promise<void>;
  handleStop: () => void;
}

export function startRunner(handlers: RunnerHandlers) {
  const rl = createInterface({ input: process.stdin });

  rl.on("line", (line) => {
    try {
      const cmd = JSON.parse(line) as Command;

      switch (cmd.type) {
        case "chat_send":
          void handlers.handleSend(cmd);
          break;
        case "chat_stop":
          handlers.handleStop();
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
}
