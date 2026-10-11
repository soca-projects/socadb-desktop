import { debug, error, info, warn } from "@tauri-apps/plugin-log";
import { toMessage } from "./errorMessage";
import type { LogCode } from "./logCodes";

type Context = Record<string, unknown>;
type Write = (message: string) => Promise<void>;

function write(fn: Write, code: LogCode, msg: string, ctx?: Context) {
  const payload = { area: code.split(".")[0], code, msg, ...(ctx ? { ctx } : {}) };
  fn(JSON.stringify(payload)).catch(() => {
    // Logging must never be the thing that fails.
  });
}

export function logError(code: LogCode, cause: unknown, ctx?: Context) {
  const stack = cause instanceof Error ? cause.stack : undefined;
  write(error, code, toMessage(cause), stack ? { ...ctx, stack } : ctx);
}

export function logWarn(code: LogCode, message: unknown, ctx?: Context) {
  write(warn, code, toMessage(message), ctx);
}

export function logInfo(code: LogCode, message: string, ctx?: Context) {
  write(info, code, message, ctx);
}

export function logDebug(code: LogCode, message: string, ctx?: Context) {
  write(debug, code, message, ctx);
}
