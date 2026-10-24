#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "mcp-server", "dist");
const RUNTIME = join(DIST, "runtime");

const host = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
const target = process.env.BUN_TARGET ?? host;
const [os, arch] = target.split("-");
const ext = os === "windows" ? ".exe" : "";
const npmOs = os === "windows" ? "win32" : os;

const failures: string[] = [];

function check(ok: boolean, message: string) {
  if (!ok) failures.push(message);
}

function size(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((sum, name) => sum + size(join(path, name)), 0);
}

const mcp = join(DIST, `socadb-mcp-${target}${ext}`);
const bun = join(RUNTIME, `bun${ext}`);
const claude = join(
  RUNTIME,
  "node_modules",
  "@anthropic-ai",
  `claude-agent-sdk-${npmOs}-${arch}`,
  `claude${ext}`,
);
const vendorRoot = join(
  RUNTIME,
  "node_modules",
  "@openai",
  `codex-${npmOs}-${arch}`,
  "vendor",
);
const triple = existsSync(vendorRoot) ? readdirSync(vendorRoot)[0] : "";
const vendor = join(vendorRoot, triple);
const codex = join(vendor, "bin", `codex${ext}`);

check(existsSync(mcp), `missing MCP binary: ${mcp}`);
check(
  !existsSync(join(RUNTIME, `socadb-mcp-${target}${ext}`)),
  "the runtime holds its own copy of the MCP binary",
);
check(existsSync(bun), `missing Bun runtime: ${bun}`);
check(existsSync(claude), `missing Claude CLI: ${claude}`);
check(existsSync(codex), `missing Codex CLI: ${codex}`);
check(
  existsSync(join(vendor, "bin", `codex-code-mode-host${ext}`)),
  "missing codex-code-mode-host",
);
for (const unused of [
  "codex-resources/voice",
  "codex-resources/zsh",
  `codex-path/rg${ext}`,
]) {
  check(!existsSync(join(vendor, unused)), `Codex ships ${unused}`);
}
if (os === "linux")
  check(
    existsSync(join(vendor, "codex-resources", "bwrap")),
    "missing bwrap for the Linux sandbox",
  );
if (os === "windows") {
  for (const helper of ["codex-windows-sandbox-setup.exe", "codex-command-runner.exe"]) {
    check(
      existsSync(join(vendor, "codex-resources", helper)),
      `missing ${helper} for the Windows sandbox`,
    );
  }
}

if (target === host) {
  for (const [name, path] of [
    ["Claude", claude],
    ["Codex", codex],
  ]) {
    try {
      console.log(
        `${name}: ${execFileSync(path, ["--version"], { encoding: "utf8" }).trim()}`,
      );
    } catch (error) {
      failures.push(`${name} CLI failed to start: ${String(error)}`);
    }
  }
  const { getMcpBinaryPath } = await import(join(RUNTIME, "agent-runner-shared.ts"));
  check(
    resolve(getMcpBinaryPath(RUNTIME)) === resolve(mcp),
    "the agents don't find the MCP binary from the runtime folder",
  );
} else {
  console.log(`Host ${host} can't run ${target}: CLIs not started`);
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(`MCP binary ${mb(size(mcp))}, runtime ${mb(size(RUNTIME))}`);
console.log(
  `  bun ${mb(size(bun))}, claude ${mb(size(claude))}, codex package ${mb(size(vendor))}`,
);

for (const failure of failures) {
  console.log(process.env.GITHUB_ACTIONS ? `::error::${failure}` : failure);
}
process.exit(failures.length ? 1 : 0);
