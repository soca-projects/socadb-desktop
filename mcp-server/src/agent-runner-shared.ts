import { createInterface } from "readline";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { platform, arch } from "os";

export interface ChatSendCommand {
  type: "chat_send";
  message: string;
  systemPrompt: string;
  sessionId?: string;
  model?: string;
}

export interface ChatStopCommand {
  type: "chat_stop";
}

export interface ChatStatusCommand {
  type: "chat_status" | "chat_init";
}

export type Command = ChatSendCommand | ChatStopCommand | ChatStatusCommand;

export function getModuleDir(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
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

export interface RunnerHandlers {
  handleSend: (cmd: ChatSendCommand) => Promise<void>;
  handleStop: () => void;
  handleStatus: () => Promise<void>;
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
        case "chat_status":
        case "chat_init":
          void handlers.handleStatus();
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
