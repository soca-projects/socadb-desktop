import { homeDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { logWarn } from "./log";
import { z } from "zod";

const ConfigObjectZ = z.record(z.string(), z.unknown());

// Set when config.json had to start fresh: the integration choices it held are
// lost, and a missing choice must not read as "never decided".
export const INTEGRATIONS_UNKNOWN = "integrationsUnknown";

let cached: string | null = null;

export async function getSocadbDir(): Promise<string> {
  if (!cached) {
    cached = await join(await homeDir(), ".socadb");
  }
  return cached;
}

export async function socadbConfigPath(): Promise<string> {
  return await join(await getSocadbDir(), "config.json");
}

// For read-modify-write cycles. A missing file starts empty. One that can't be
// read throws: rewriting it would drop every other setting. One that doesn't
// parse is copied to config.invalid.json first, so its settings can still be
// recovered while new ones are saved again.
export async function readConfigForUpdate(
  path: string,
): Promise<Record<string, unknown>> {
  if (!(await exists(path))) return {};
  const content = await readTextFile(path);
  const parsed = parseConfig(content);
  if (parsed) return parsed;
  await invoke("atomic_write", {
    path: path.replace(/config\.json$/, `config.invalid-${Date.now()}.json`),
    content,
  });
  logWarn(
    "config.invalid",
    "config.json didn't parse; it was copied to config.invalid-<time>.json",
  );
  return { [INTEGRATIONS_UNKNOWN]: true };
}

export function parseConfig(content: string): Record<string, unknown> | null {
  try {
    const parsed = ConfigObjectZ.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Serializes all read-modify-write cycles on ~/.socadb/config.json. Multiple
// modules (theme, language, chat) update the same file with sibling keys; if
// two RMW operations interleave, the later write can drop changes made by the
// earlier one — including silently restoring plaintext apiKeys after a keyring
// migration. The queue forces them to run sequentially within a single process.
//
// Each work() runs to completion (success or failure) before the next one
// starts. A failure in one work() does NOT skip the next: the chain is kept
// rejection-free internally, and only the calling work() sees the error.
let chain: Promise<void> = Promise.resolve();

export function queueConfigWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
