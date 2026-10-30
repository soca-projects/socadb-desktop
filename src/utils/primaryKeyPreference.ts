import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { queueConfigWrite, readConfigForUpdate, socadbConfigPath } from "./socadbDir";
import { PrimaryKeyPreferenceZ } from "./zodSchemas";
import { DEFAULT_PRIMARY_KEYS, type PrimaryKeyPreference } from "./columnDefaults";
import { logError } from "./log";

const STORAGE_KEY = "socadb_primary_key";
const ConfigZ = z.record(z.string(), z.unknown());

function parse(raw: string | null): PrimaryKeyPreference | null {
  if (raw === null) return null;
  try {
    const parsed = PrimaryKeyPreferenceZ.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getPrimaryKeyPreference(): PrimaryKeyPreference {
  try {
    return parse(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_PRIMARY_KEYS;
  } catch {
    return DEFAULT_PRIMARY_KEYS;
  }
}

export async function loadPrimaryKeyPreference(): Promise<void> {
  try {
    const config = ConfigZ.parse(
      JSON.parse(await readTextFile(await socadbConfigPath())),
    );
    const parsed = PrimaryKeyPreferenceZ.safeParse(config.primaryKey);
    if (parsed.success) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
  } catch {
    // No config.json yet, or no localStorage.
  }
}

export async function setPrimaryKeyPreference(
  value: PrimaryKeyPreference,
): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // No localStorage.
  }
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      const data = await readConfigForUpdate(path);
      data.primaryKey = value;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    logError("settings.primary_key.persist_failed", err);
  }
}
