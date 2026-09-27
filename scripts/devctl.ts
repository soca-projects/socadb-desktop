#!/usr/bin/env bun
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const USAGE = `Commands:
  snapshot                         visible interactive elements
  text [target] [--max N]          visible text (whole window by default)
  state                            schema, chat and window state
  click <target> [--index N] [--force]
                                   click by accessible name, text, or css=<selector>;
                                   --force clicks hidden elements (hover-only controls)
  focus <target> [--index N]       focus an element (reveals :focus-within controls)
  type <target> <text> [--append] [--index N]
  clear <target> [--index N]
  select <target> <option> [--index N]
  press <key> [target]             e.g. Enter, Escape, Meta+k
  wait <text> [--gone] [--timeout MS]
  wait --target <target> [--gone] [--timeout MS]
  shot [file.png]                  screenshot of the app window`;

function readPort(): number {
  const file = join(homedir(), ".socadb", ".port");
  if (!existsSync(file))
    throw new Error("No ~/.socadb/.port: start the app with `bun run tauri dev`");
  return Number(readFileSync(file, "utf-8").trim());
}

function send(
  action: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${readPort()}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`${action} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, action, payload }));
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Cannot reach the app: is it running?"));
    };
    ws.onmessage = (event) => {
      clearTimeout(timer);
      ws.close();
      const msg = JSON.parse(String(event.data));
      if (msg.error) {
        const hint = String(msg.error).startsWith("Unknown action: dev_")
          ? "\n(the port belongs to a release build: quit the installed SocaDB and run `bun run tauri dev`)"
          : "";
        reject(new Error(`${msg.error}${hint}`));
      } else resolve(msg.result);
    };
  });
}

const WINDOW_ID_SWIFT = `
import CoreGraphics
let pid = Int32(CommandLine.arguments[1])!
let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
let own = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && (0...8).contains($0[kCGWindowLayer as String] as? Int ?? -1) }
let area = { (w: [String: Any]) -> Double in
  let b = w[kCGWindowBounds as String] as! [String: Double]
  return b["Width"]! * b["Height"]!
}
if let main = own.max(by: { area($0) < area($1) }) { print(main[kCGWindowNumber as String]!) }
`;

function windowId(): string {
  const pid = spawnSync("lsof", ["-nP", `-iTCP:${readPort()}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf-8",
  })
    .stdout.trim()
    .split("\n")[0];
  if (!pid) throw new Error("No process is listening on the bridge port");
  const helper = join(tmpdir(), "socadb-devctl-window-id-v3");
  if (!existsSync(helper)) {
    const source = `${helper}.swift`;
    writeFileSync(source, WINDOW_ID_SWIFT);
    const built = spawnSync("swiftc", ["-O", "-o", helper, source], {
      encoding: "utf-8",
    });
    if (built.status !== 0) throw new Error(`swiftc failed: ${built.stderr}`);
  }
  const id = spawnSync(helper, [pid], { encoding: "utf-8" }).stdout.trim();
  if (!id) throw new Error(`No window for pid ${pid}`);
  return id;
}

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
}

function flag(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const index = option(args, "--index");
  const at = index === undefined ? {} : { index: Number(index) };
  let result: unknown;
  switch (command) {
    case "snapshot":
    case "state":
      result = await send(`dev_${command}`, {}, 10000);
      break;
    case "text": {
      const max = option(args, "--max");
      result = await send(
        "dev_text",
        { target: args[0], ...(max ? { maxChars: Number(max) } : {}) },
        10000,
      );
      break;
    }
    case "click": {
      const force = flag(args, "--force");
      result = await send("dev_click", { target: args[0], force, ...at }, 10000);
      break;
    }
    case "focus":
      result = await send("dev_focus", { target: args[0], ...at }, 10000);
      break;
    case "type": {
      const append = flag(args, "--append");
      result = await send(
        "dev_type",
        { target: args[0], text: args[1], append, ...at },
        10000,
      );
      break;
    }
    case "clear":
      result = await send("dev_type", { target: args[0], text: "", ...at }, 10000);
      break;
    case "select":
      result = await send(
        "dev_select",
        { target: args[0], option: args[1], ...at },
        10000,
      );
      break;
    case "press":
      result = await send("dev_press", { key: args[0], target: args[1], ...at }, 10000);
      break;
    case "wait": {
      const timeoutMs = Number(option(args, "--timeout") ?? 15000);
      const target = option(args, "--target");
      const gone = flag(args, "--gone");
      const condition = target ? { target } : { text: args[0] };
      result = await send(
        "dev_wait",
        { ...condition, gone, timeoutMs },
        timeoutMs + 5000,
      );
      break;
    }
    case "shot": {
      const file = args[0] ?? join(tmpdir(), `socadb-shot-${Date.now()}.png`);
      const shot = spawnSync("screencapture", ["-x", "-o", "-l", windowId(), file], {
        encoding: "utf-8",
      });
      if (shot.status !== 0) throw new Error(`screencapture failed: ${shot.stderr}`);
      result = file;
      break;
    }
    default:
      console.log(USAGE);
      process.exit(command && command !== "help" ? 1 : 0);
  }
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
