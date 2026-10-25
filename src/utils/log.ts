import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { toMessage } from "./errorMessage";
import { maskPaths, maskQuoted } from "./logPrivacy";
import type { LogCode } from "./logCodes";

type Context = Record<string, unknown>;
type Write = (message: string) => Promise<void>;

const LEVELS = { debug: 2, info: 3, warn: 4, error: 5 } as const;

function command(level: keyof typeof LEVELS): Write {
  return async (message) => {
    await invoke("plugin:log|log", { level: LEVELS[level], message });
  };
}

const debug = command("debug");
const info = command("info");
const warn = command("warn");
const error = command("error");

const MAX_MESSAGE = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

const rates = new Map<LogCode, { since: number; count: number; dropped: number }>();

// An error thrown in a render or event loop would otherwise rotate the whole
// history out of the log within minutes.
function admit(
  code: LogCode,
  now: number,
): { admitted: boolean; firstDrop: boolean; dropped: number } {
  let rate = rates.get(code);
  let dropped = 0;
  if (!rate || now - rate.since >= RATE_WINDOW_MS) {
    dropped = rate?.dropped ?? 0;
    rate = { since: now, count: 0, dropped: 0 };
    rates.set(code, rate);
  }
  rate.count += 1;
  if (rate.count > RATE_LIMIT) {
    rate.dropped += 1;
    return { admitted: false, firstDrop: rate.dropped === 1, dropped };
  }
  return { admitted: true, firstDrop: false, dropped };
}

export function flushSuppressed() {
  for (const [code, rate] of rates) {
    if (rate.dropped === 0) continue;
    send(warn, "log.suppressed", "Repeated lines were dropped", {
      code,
      dropped: rate.dropped,
    });
    rate.dropped = 0;
  }
}

function write(fn: Write, code: LogCode, message: string, ctx?: Context) {
  const { admitted, firstDrop, dropped } = admit(code, Date.now());
  if (dropped > 0) {
    send(warn, "log.suppressed", "Repeated lines were dropped", { code, dropped });
  }
  // The summary may never come if the app quits mid-loop: say it now.
  if (firstDrop) {
    send(warn, "log.suppressing", "Over 20 lines a minute: further lines are dropped", {
      code,
    });
  }
  if (admitted) send(fn, code, message, ctx);
}

function send(fn: Write, code: LogCode, message: string, ctx?: Context) {
  const msg =
    message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message;
  const payload = { area: code.split(".")[0], code, msg, ...(ctx ? { ctx } : {}) };
  fn(JSON.stringify(payload)).catch(() => {
    // Logging must never be the thing that fails.
  });
}

function describe(cause: unknown): string {
  if (cause instanceof z.ZodError) {
    return cause.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  // Both engines quote the offending input (JSC the token, V8 a snippet), and
  // that input is a user's file or an agent's output.
  if (cause instanceof SyntaxError) return "Invalid JSON";
  return maskQuoted(maskPaths(toMessage(cause)));
}

// V8 starts a stack with "Name: message", which would bypass describe().
function stackOf(cause: unknown): string | undefined {
  if (!(cause instanceof Error) || cause instanceof z.ZodError) return undefined;
  if (cause instanceof SyntaxError || !cause.stack) return undefined;
  const lines = cause.stack.split("\n");
  return (lines[0].startsWith(`${cause.name}:`) ? lines.slice(1) : lines).join("\n");
}

export function logError(code: LogCode, cause: unknown, ctx?: Context) {
  const stack = stackOf(cause);
  write(error, code, describe(cause), stack ? { ...ctx, stack } : ctx);
}

export function logWarn(code: LogCode, message: unknown, ctx?: Context) {
  write(warn, code, describe(message), ctx);
}

export function logInfo(code: LogCode, message: string, ctx?: Context) {
  write(info, code, message, ctx);
}

// Release logs stop at info: sending debug lines would only use up quotas.
export function logDebug(code: LogCode, message: string, ctx?: Context) {
  if (import.meta.env.DEV) write(debug, code, message, ctx);
}
