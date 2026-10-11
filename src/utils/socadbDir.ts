import { homeDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { z } from "zod";

const ConfigObjectZ = z.record(z.string(), z.unknown());

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

// For read-modify-write cycles: a missing file starts empty, but one that can't
// be read or parsed throws, since rewriting it with one key would silently drop
// every other setting.
export async function readConfigForUpdate(
  path: string,
): Promise<Record<string, unknown>> {
  if (!(await exists(path))) return {};
  return ConfigObjectZ.parse(JSON.parse(await readTextFile(path)));
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
