import { appendFileSync, mkdirSync, renameSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Same folder as the app's own log (tauri-plugin-log's app_log_dir).
const IDENTIFIER = "com.socadb.desktop";
const MAX_BYTES = 2_000_000;
const launch = `${Date.now().toString(16)}-${process.pid.toString(16)}`;

type Level = "info" | "warn" | "error";
type Context = Record<string, unknown>;

function logDir(): string {
  const home = homedir();
  if (process.platform === "darwin") return join(home, "Library", "Logs", IDENTIFIER);
  if (process.platform === "win32") {
    return join(
      process.env.LOCALAPPDATA ?? join(home, "AppData", "Local"),
      IDENTIFIER,
      "logs",
    );
  }
  return join(
    process.env.XDG_DATA_HOME ?? join(home, ".local", "share"),
    IDENTIFIER,
    "logs",
  );
}

function scrub(text: string): string {
  const home = homedir();
  return text
    .split(home)
    .join("~")
    .split(home.replace(/\\/g, "\\\\"))
    .join("~")
    .replace(/sk-[A-Za-z0-9_.-]{16,}/g, "sk-[redacted]");
}

function write(level: Level, code: string, msg: string, ctx?: Context) {
  try {
    const dir = logDir();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "mcp-server.log");
    try {
      if (statSync(file).size > MAX_BYTES)
        renameSync(file, join(dir, "mcp-server.1.log"));
    } catch {
      // No log file yet.
    }
    const line = {
      ts: new Date().toISOString(),
      level,
      launch,
      src: "mcp",
      area: code.split(".")[0],
      code,
      msg,
      ...(ctx ? { ctx } : {}),
    };
    appendFileSync(file, scrub(JSON.stringify(line)) + "\n");
  } catch {
    // stdout belongs to the MCP protocol: a logging failure has to stay silent.
  }
}

export const mcpLog = {
  info: (code: string, msg: string, ctx?: Context) => write("info", code, msg, ctx),
  warn: (code: string, msg: string, ctx?: Context) => write("warn", code, msg, ctx),
  error: (code: string, msg: string, ctx?: Context) => write("error", code, msg, ctx),
};
