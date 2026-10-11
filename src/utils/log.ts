import { debug, error, info, warn } from "@tauri-apps/plugin-log";
import { z } from "zod";
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

function describe(cause: unknown): string {
  if (cause instanceof z.ZodError) {
    return cause.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return toMessage(cause);
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

export function logDebug(code: LogCode, message: string, ctx?: Context) {
  write(debug, code, message, ctx);
}
