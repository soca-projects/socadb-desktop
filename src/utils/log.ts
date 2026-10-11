import { debug, error, info, warn } from "@tauri-apps/plugin-log";
import { z } from "zod";
import { toMessage } from "./errorMessage";
import { maskPaths } from "./logPrivacy";
import type { LogCode } from "./logCodes";

type Context = Record<string, unknown>;
type Write = (message: string) => Promise<void>;

const MAX_MESSAGE = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

const rates = new Map<LogCode, { since: number; count: number; dropped: number }>();

// An error thrown in a render or event loop would otherwise rotate the whole
// history out of the log within minutes.
function admit(code: LogCode, now: number): { admitted: boolean; dropped: number } {
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
    return { admitted: false, dropped };
  }
  return { admitted: true, dropped };
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
  const { admitted, dropped } = admit(code, Date.now());
  if (dropped > 0) {
    send(warn, "log.suppressed", "Repeated lines were dropped", { code, dropped });
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
  return maskPaths(toMessage(cause));
}

export function logError(code: LogCode, cause: unknown, ctx?: Context) {
  const stack =
    cause instanceof Error && !(cause instanceof z.ZodError) ? cause.stack : undefined;
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
