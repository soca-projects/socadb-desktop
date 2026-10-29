#!/usr/bin/env bun
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";

const ROOT = join(import.meta.dir, "..");
const NSIS = join(ROOT, "src-tauri", "target", "release", "bundle", "nsis");
const DIST = join(ROOT, "mcp-server", "dist");
const MCP = "socadb-mcp-windows-x64.exe";

const failures: string[] = [];

function check(ok: boolean, message: string) {
  if (!ok) failures.push(message);
}

function finish(): never {
  for (const failure of failures) {
    console.log(process.env.GITHUB_ACTIONS ? `::error::${failure}` : failure);
  }
  process.exit(failures.length ? 1 : 0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function exited(child: ChildProcess): Promise<{ code: number | null; at: number }> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) resolve({ code: child.exitCode, at: Date.now() });
    else child.on("exit", (code) => resolve({ code, at: Date.now() }));
  });
}

const installer = existsSync(NSIS)
  ? readdirSync(NSIS).find((file) => file.endsWith("-setup.exe"))
  : undefined;
if (!installer) {
  failures.push(`missing the installer in ${NSIS}`);
  finish();
}

const work = mkdtempSync(join(tmpdir(), "socadb-installer-"));
const dir = join(work, "SocaDB");
const home = join(work, "home");
mkdirSync(home);

// NSIS reads /D only as the last argument.
const install = (...flags: string[]) =>
  exited(spawn(join(NSIS, installer), [...flags, "/S", `/D=${dir}`]));

const oldCopies = () =>
  existsSync(dir)
    ? readdirSync(dir).filter(
        (file) => file.startsWith(`${MCP}.`) && file.endsWith(".old"),
      )
    : [];

function runtimeFiles(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? runtimeFiles(root, join(prefix, entry.name))
        : [join(prefix, entry.name)],
    )
    .sort();
}

const ReplyZ = z.object({ id: z.number() });

function startServer() {
  const server = spawn(join(dir, MCP), [], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    windowsHide: true,
  });
  const waiting = new Map<number, () => void>();
  createInterface({ input: server.stdout }).on("line", (line) => {
    try {
      const reply = ReplyZ.safeParse(JSON.parse(line));
      if (reply.success) waiting.get(reply.data.id)?.();
    } catch {}
  });
  const answers = (id: number, method: string, params: unknown = {}) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 20_000);
      waiting.set(id, () => {
        clearTimeout(timer);
        resolve(true);
      });
      server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { server, answers };
}

function runtimeDifferences(installed: string, built: string): string[] {
  const installedFiles = new Set(runtimeFiles(installed));
  const builtFiles = runtimeFiles(built);
  const differences = builtFiles.flatMap((file) => {
    if (!installedFiles.has(file)) return [`missing ${file}`];
    const [a, b] = [join(installed, file), join(built, file)];
    const same =
      statSync(a).size === statSync(b).size &&
      (!file.endsWith(".exe") || readFileSync(a).equals(readFileSync(b)));
    return same ? [] : [`different ${file}`];
  });
  const extra = [...installedFiles].filter((file) => !builtFiles.includes(file));
  return [...differences, ...extra.map((file) => `extra ${file}`)];
}

// A console of its own, like the app's agents: Restart Manager stops console
// programs with Ctrl+C, which would reach this check on a shared console. The
// helper reports when it lets go, since its exit lags behind on Windows.
function hold(path: string, ms: number) {
  const startedAt = Date.now();
  const child = spawn(
    process.execPath,
    [
      "-e",
      `const fs = require("fs");
       const fd = fs.openSync(${JSON.stringify(path)}, "r");
       setTimeout(() => {
         fs.closeSync(fd);
         process.stdout.write("released\\n", () => process.exit(0));
       }, ${ms});`,
    ],
    { windowsHide: true },
  );
  let releasedAt: number | null = null;
  child.stdout.on("data", () => (releasedAt ??= Date.now()));
  return { startedAt, released: () => releasedAt, exit: exited(child) };
}

try {
  const foreign = join(dir, "runtime", "node_modules", "someone-else", "keep.txt");
  mkdirSync(join(foreign, ".."), { recursive: true });
  writeFileSync(foreign, "");
  const first = await install();
  check(first.code === 0, `the first install exited with ${first.code}`);
  for (const file of ["socadb-desktop.exe", MCP, "uninstall.exe", "runtime"]) {
    check(existsSync(join(dir, file)), `the install has no ${file}`);
  }
  check(existsSync(foreign), "a first install deleted files it didn't put there");

  const leftover = join(dir, "runtime", "node_modules", "left-by-an-older-version");
  mkdirSync(leftover);
  writeFileSync(join(leftover, "index.js"), "");
  const notes = join(dir, "runtime", "notes.txt");
  writeFileSync(notes, "");

  const { server, answers } = startServer();
  check(
    await answers(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "check-installer", version: "1" },
    }),
    "the installed MCP server doesn't answer",
  );

  // The first stands for the app still quitting, which the update must wait
  // for; the second for an agent the app left running, which it must stop.
  const app = hold(join(dir, "socadb-desktop.exe"), 15_000);
  const runtimeExe = runtimeFiles(join(dir, "runtime")).find(
    (file) => file.includes("@anthropic-ai") && file.endsWith(".exe"),
  );
  const agent = hold(join(dir, "runtime", runtimeExe ?? "missing.exe"), 40_000);
  await sleep(1_000);
  let movedAt: number | null = null;
  const watch = setInterval(() => {
    if (movedAt === null && oldCopies().length > 0) movedAt = Date.now();
  }, 100);
  const updateStart = Date.now();
  const update = await install("/UPDATE");
  clearInterval(watch);
  const appHeld = await app.exit;
  const agentHeld = await agent.exit;
  const releasedAt = app.released();
  const at = (time: number | null) =>
    time === null ? "never" : `${time - updateStart} ms`;
  const timeline = `from the update's start: app let go ${at(releasedAt)}, MCP server set aside ${at(movedAt)}, runtime process gone ${at(agentHeld.at)}, update done ${at(update.at)}`;
  console.log(timeline);

  check(update.code === 0, `the update exited with ${update.code}`);
  check(
    appHeld.code === 0,
    `the update killed the app instead of waiting (exit ${appHeld.code})`,
  );
  check(
    releasedAt !== null &&
      movedAt !== null &&
      movedAt >= releasedAt - 200 &&
      movedAt - releasedAt < 3_000,
    `the update didn't wait for the app to let go of its executable, or went on long after (${timeline})`,
  );
  check(
    runtimeExe !== undefined &&
      movedAt !== null &&
      agentHeld.at > movedAt &&
      agentHeld.at - agent.startedAt < 38_000,
    `the update didn't stop a process still using runtime/ (${timeline})`,
  );
  check(
    oldCopies().length === 1,
    `the running MCP server wasn't set aside: ${oldCopies().join(", ")}`,
  );
  check(
    existsSync(join(dir, MCP)) &&
      readFileSync(join(dir, MCP)).equals(readFileSync(join(DIST, MCP))),
    "the update didn't install the new MCP server",
  );
  check(existsSync(notes), "the update deleted a file in runtime/ that isn't SocaDB's");
  rmSync(notes, { force: true });
  const differences = runtimeDifferences(join(dir, "runtime"), join(DIST, "runtime"));
  check(
    differences.length === 0,
    `the runtime after the update isn't the one built: ${differences.slice(0, 5).join(", ")}`,
  );
  check(
    await answers(2, "tools/list"),
    "the MCP server an AI app was running stopped answering during the update",
  );

  server.stdin.end();
  await exited(server);
  const again = await install("/UPDATE");
  check(again.code === 0, `the second update exited with ${again.code}`);
  check(oldCopies().length === 0, "the set-aside MCP server stayed once nothing ran it");

  mkdirSync(leftover);
  writeFileSync(join(leftover, "index.js"), "");
  writeFileSync(join(dir, "runtime", "bun.exe"), "");
  writeFileSync(join(dir, `${MCP}.1.old`), "");
  const uninstall = await exited(spawn(join(dir, "uninstall.exe"), ["/S"]));
  check(uninstall.code === 0, `the uninstaller exited with ${uninstall.code}`);
  for (let i = 0; i < 120 && existsSync(dir); i++) await sleep(500);
  check(
    !existsSync(dir),
    `the uninstall left files behind: ${existsSync(dir) ? readdirSync(dir).join(", ") : ""}`,
  );
} catch (error) {
  failures.push(`the installer check crashed: ${String(error)}`);
} finally {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {}
}

finish();
