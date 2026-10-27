#!/usr/bin/env bun
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import {
  agentRuntimeDir,
  getMcpBinaryPath,
} from "../mcp-server/src/agent-runner-shared.ts";
import { locateCodex } from "../mcp-server/src/codex-exec.ts";

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

const AgentEventZ = z.object({
  type: z.string(),
  event: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});
type AgentEvent = z.infer<typeof AgentEventZ>;

// The empty home and config folders keep the developer's own login out: without
// them, the check would send a real message on their account instead of hitting
// the login error.
function sendFirstMessage(
  provider: string,
  answered: (event: AgentEvent) => boolean,
): Promise<string | null> {
  const home = mkdtempSync(join(tmpdir(), "socadb-check-"));
  const claudeConfig = join(home, ".claude");
  const codexHome = join(home, ".codex");
  mkdirSync(claudeConfig);
  mkdirSync(codexHome);
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(ANTHROPIC_|CLAUDE_|CLAUDECODE$|OPENAI_|CODEX_)/.test(key),
      ),
    ),
    HOME: home,
    USERPROFILE: home,
    CFFIXED_USER_HOME: home,
    CLAUDE_CONFIG_DIR: claudeConfig,
    CODEX_HOME: codexHome,
  };
  const agent = spawn(mcp, ["agent", provider], { env });
  let result: string | null | undefined;
  let settled = false;
  let stderr = "";
  return new Promise((done) => {
    const finish = (failure: string | null) => {
      if (result !== undefined) return;
      result = failure;
      clearTimeout(timer);
      // Killing the runner would orphan the CLI, which keeps going on its own;
      // stopping the turn first ends the CLI with it.
      agent.stdin.end(JSON.stringify({ type: "chat_stop" }) + "\n");
      setTimeout(() => agent.kill(), 5_000).unref();
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {}
      done(result ?? null);
    };
    const timer = setTimeout(() => finish("no answer within 90 s"), 90_000);
    agent.on("error", (error) => {
      finish(String(error));
      settle();
    });
    agent.stdin.on("error", () => {});
    agent.stderr.on("data", (chunk) => (stderr += chunk));
    createInterface({ input: agent.stdout }).on("line", (line) => {
      let parsed;
      try {
        parsed = AgentEventZ.safeParse(JSON.parse(line));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const event = parsed.data;
      if (event.type === "ready") {
        agent.stdin.write(
          JSON.stringify({ type: "chat_send", message: "hello", systemPrompt: "check" }) +
            "\n",
        );
      } else if (answered(event)) {
        finish(null);
      } else if (event.event === "error") {
        finish(event.message ?? line);
      }
    });
    agent.on("exit", (code) => {
      finish(`exited with ${code} before answering: ${stderr.trim()}`);
      settle();
    });
  });
}

const RpcResponseZ = z.object({
  id: z.number(),
  result: z
    .object({
      tools: z.array(z.object({ name: z.string() })).optional(),
      isError: z.boolean().optional(),
      content: z.array(z.object({ text: z.string().optional() })).optional(),
    })
    .optional(),
});

function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 1));
    });
  });
}

async function serveWithoutApp(
  args: string[],
): Promise<{ failure: string | null; tools: string[] }> {
  const home = mkdtempSync(join(tmpdir(), "socadb-check-"));
  // A port file left behind by a crash: the server tries the dead port.
  mkdirSync(join(home, ".socadb"));
  writeFileSync(join(home, ".socadb", ".port"), String(await closedPort()));
  const server = spawn(mcp, args, {
    env: { ...process.env, HOME: home, USERPROFILE: home, CFFIXED_USER_HOME: home },
  });
  const rpc = (id: number, method: string, params: unknown = {}) =>
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  const responses = new Map<number, z.infer<typeof RpcResponseZ>>();
  let stderr = "";
  let settled = false;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  return new Promise((done) => {
    const finish = (failure: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(exitTimer);
      server.kill();
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {}
      const tools = responses.get(2)?.result?.tools?.map((t) => t.name) ?? [];
      done({ failure, tools });
    };
    const timer = setTimeout(() => finish("no answer within 30 s"), 30_000);
    server.on("error", (error) => finish(String(error)));
    server.stderr.on("data", (chunk) => (stderr += chunk));
    createInterface({ input: server.stdout }).on("line", (line) => {
      let parsed;
      try {
        parsed = RpcResponseZ.safeParse(JSON.parse(line));
      } catch {
        return;
      }
      if (!parsed.success) return;
      responses.set(parsed.data.id, parsed.data);
      if (parsed.data.id === 1) {
        server.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
        );
        rpc(2, "tools/list");
        rpc(3, "tools/call", { name: "get_schema", arguments: {} });
      }
      if (parsed.data.id === 3 || parsed.data.id === 4) {
        const text = parsed.data.result?.content?.[0]?.text ?? "";
        if (!parsed.data.result?.isError || !text.includes("isn't open")) {
          finish(`a tool call without SocaDB answered ${line}`);
          return;
        }
      }
      if (parsed.data.id === 3) {
        setTimeout(() => rpc(4, "tools/call", { name: "get_schema", arguments: {} }), 1_500);
      }
      if (parsed.data.id === 4) {
        server.stdin.end();
        exitTimer = setTimeout(
          () => finish("still running 5 s after its client closed stdin"),
          5_000,
        );
      }
    });
    server.on("exit", (code) => {
      if (!responses.has(4)) finish(`exited with ${code} before answering: ${stderr.trim()}`);
      else finish(code === 0 ? null : `exited with ${code} after stdin closed: ${stderr.trim()}`);
    });
    rpc(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "check-runtime", version: "1" },
    });
  });
}

const mcp = join(DIST, `socadb-mcp-${target}${ext}`);
const claudePackage = `@anthropic-ai/claude-agent-sdk-${npmOs}-${arch}`;
const codexPackage = `@openai/codex-${npmOs}-${arch}`;
const claude = join(RUNTIME, "node_modules", claudePackage, `claude${ext}`);
const vendorRoot = join(RUNTIME, "node_modules", codexPackage, "vendor");
const triple = existsSync(vendorRoot) ? readdirSync(vendorRoot)[0] : "";
const vendor = join(vendorRoot, triple);
const codex = join(vendor, "bin", `codex${ext}`);

check(existsSync(mcp), `missing MCP binary: ${mcp}`);
check(
  !existsSync(join(RUNTIME, `socadb-mcp-${target}${ext}`)),
  "the runtime holds its own copy of the MCP binary",
);
const runtimeEntries = existsSync(RUNTIME) ? readdirSync(RUNTIME) : [];
check(
  runtimeEntries.join() === "node_modules",
  `the runtime holds more than the agent CLIs: ${runtimeEntries.join(", ")}`,
);
const packages = existsSync(join(RUNTIME, "node_modules"))
  ? readdirSync(join(RUNTIME, "node_modules")).flatMap((scope) =>
      readdirSync(join(RUNTIME, "node_modules", scope)).map((name) => `${scope}/${name}`),
    )
  : [];
check(
  packages.sort().join() === [claudePackage, codexPackage].sort().join(),
  `the runtime ships other packages than the agent CLIs: ${packages.join(", ")}`,
);
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
  for (const provider of ["claude", "codex"]) {
    const agent = spawnSync(mcp, ["agent", provider], {
      input: "",
      encoding: "utf8",
      timeout: 30_000,
    });
    check(
      agent.status === 0 &&
        agent.stdout.includes('{"type":"ready"}') &&
        !agent.stderr.includes("not found"),
      `the ${provider} agent doesn't start from the MCP binary: ${agent.stderr || agent.error}`,
    );
  }
  const claudeFailure = await sendFirstMessage(
    "claude",
    (event) => event.event === "error" && event.code === "auth",
  );
  check(!claudeFailure, `the claude agent doesn't reach its CLI: ${claudeFailure}`);
  const codexFailure = await sendFirstMessage(
    "codex",
    (event) => event.event === "session_init",
  );
  check(!codexFailure, `the codex agent doesn't reach its CLI: ${codexFailure}`);
  const external = await serveWithoutApp([]);
  check(!external.failure, `the MCP server doesn't serve AI apps without SocaDB: ${external.failure}`);
  check(
    ["get_schema", "create_table", "new_schema", "open_schema"].every((tool) =>
      external.tools.includes(tool),
    ),
    `AI apps don't get every tool: ${external.tools.join(", ")}`,
  );
  const chat = await serveWithoutApp(["--chat"]);
  check(!chat.failure, `the MCP server doesn't serve SocaDB's chat: ${chat.failure}`);
  check(
    chat.tools.includes("create_table") && !chat.tools.includes("new_schema"),
    `SocaDB's chat gets the wrong tools: ${chat.tools.join(", ")}`,
  );
  check(
    getMcpBinaryPath(ROOT, mcp) === mcp,
    "the agents don't give their own binary as the MCP server",
  );
  check(
    resolve(agentRuntimeDir(ROOT, mcp)) === resolve(RUNTIME),
    "the agents don't look for the CLIs in the runtime folder",
  );
  try {
    check(
      locateCodex(RUNTIME).executable === codex,
      "the Codex agent finds its CLI outside the runtime folder",
    );
  } catch (error) {
    failures.push(`the Codex agent doesn't find its CLI: ${String(error)}`);
  }
} else {
  console.log(`Host ${host} can't run ${target}: CLIs not started`);
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(`MCP binary ${mb(size(mcp))}, runtime ${mb(size(RUNTIME))}`);
console.log(`  claude ${mb(size(claude))}, codex package ${mb(size(vendor))}`);

for (const failure of failures) {
  console.log(process.env.GITHUB_ACTIONS ? `::error::${failure}` : failure);
}
process.exit(failures.length ? 1 : 0);
