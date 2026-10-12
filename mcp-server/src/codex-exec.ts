import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import type { ThreadEvent } from "@openai/codex-sdk";

const PLATFORM_PACKAGES: Record<string, { pkg: string; triple: string }> = {
  "linux-x64": { pkg: "@openai/codex-linux-x64", triple: "x86_64-unknown-linux-musl" },
  "linux-arm64": { pkg: "@openai/codex-linux-arm64", triple: "aarch64-unknown-linux-musl" },
  "darwin-x64": { pkg: "@openai/codex-darwin-x64", triple: "x86_64-apple-darwin" },
  "darwin-arm64": { pkg: "@openai/codex-darwin-arm64", triple: "aarch64-apple-darwin" },
  "win32-x64": { pkg: "@openai/codex-win32-x64", triple: "x86_64-pc-windows-msvc" },
  "win32-arm64": { pkg: "@openai/codex-win32-arm64", triple: "aarch64-pc-windows-msvc" },
};

// The agent reads the web, so a page can steer it: a read-only sandbox without
// shell, browser, computer use, connectors, plugins or sub-agents keeps it away
// from the user's machine. Code mode stays on: GPT-6 calls its tools through it.
// codex refuses to start on an unknown name, so check-codex.ts runs in CI.
export const CODEX_DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "browser_use",
  "browser_use_external",
  "computer_use",
  "in_app_browser",
  "apps",
  "plugins",
  "remote_plugin",
  "multi_agent",
  "image_generation",
  "view_image",
  "hooks",
];

export function locateCodex(): { executable: string; pathDirs: string[] } {
  const target = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  if (!target) throw new Error(`Unsupported platform: ${process.platform} (${process.arch})`);
  const codexRequire = createRequire(createRequire(import.meta.url).resolve("@openai/codex/package.json"));
  const packageRoot = join(dirname(codexRequire.resolve(`${target.pkg}/package.json`)), "vendor", target.triple);
  const binary = process.platform === "win32" ? "codex.exe" : "codex";
  const executable = join(packageRoot, "bin", binary);
  if (!existsSync(executable)) throw new Error(`Codex CLI binary not found at ${executable}`);
  const pathDir = join(packageRoot, "codex-path");
  return { executable, pathDirs: existsSync(pathDir) ? [pathDir] : [] };
}

function isThreadEvent(value: unknown): value is ThreadEvent {
  return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";
}

// Runs one `codex exec` turn and yields its JSON events. The SDK builds the same
// command but can't pass --ignore-user-config, which keeps the user's own Codex
// setup (MCP servers, notify commands, hooks) out of SocaDB's agent.
export async function* runCodexExec(
  args: string[],
  input: string,
  signal: AbortSignal,
): AsyncGenerator<ThreadEvent> {
  const { executable, pathDirs } = locateCodex();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE ??= "codex_sdk_ts";
  if (pathDirs.length > 0) {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    env[pathKey] = [...pathDirs, env[pathKey]].filter(Boolean).join(delimiter);
  }

  const child = spawn(executable, ["exec", "--experimental-json", "--ignore-user-config", ...args], {
    env,
    signal,
  });
  let spawnError: Error | undefined;
  child.once("error", (error) => (spawnError = error));
  const stderr: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("exit", (code, exitSignal) => resolve({ code, signal: exitSignal })),
  );
  // A failed spawn reports through "error" and the exit code; its stdin error must not crash the runner.
  child.stdin.on("error", () => undefined);
  child.stdin.end(input);

  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        throw new Error(`Failed to parse codex output: ${line}`);
      }
      if (isThreadEvent(event)) yield event;
    }
    if (spawnError) throw spawnError;
    const { code, signal: exitSignal } = await exited;
    if (code !== 0 || exitSignal) {
      const detail = exitSignal ? `signal ${exitSignal}` : `code ${code ?? 1}`;
      throw new Error(`Codex Exec exited with ${detail}: ${Buffer.concat(stderr).toString("utf8")}`);
    }
  } finally {
    lines.close();
    child.removeAllListeners();
    if (!child.killed) child.kill();
  }
}
