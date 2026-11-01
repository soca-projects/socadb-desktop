import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { queueConfigWrite, readConfigForUpdate, socadbConfigPath } from "./socadbDir";
import { UpdatePreferencesZ } from "./zodSchemas";
import { logError } from "./log";

export type UpdatePreferences = z.infer<typeof UpdatePreferencesZ>;

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  autoCheck: true,
  autoInstall: true,
};

const STORAGE_KEY = "socadb_updates";
const ConfigZ = z.record(z.string(), z.unknown());

function parse(raw: string | null): UpdatePreferences | null {
  if (raw === null) return null;
  try {
    const parsed = UpdatePreferencesZ.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function getUpdatePreferences(): UpdatePreferences {
  try {
    return parse(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_UPDATE_PREFERENCES;
  } catch {
    return DEFAULT_UPDATE_PREFERENCES;
  }
}

// Installing on its own only follows automatic checks: a check the user starts
// with automatic checks off asks first.
export function asksBeforeDownloading(preferences: UpdatePreferences): boolean {
  return !(preferences.autoCheck && preferences.autoInstall);
}

export async function loadUpdatePreferences(): Promise<void> {
  try {
    const config = ConfigZ.parse(
      JSON.parse(await readTextFile(await socadbConfigPath())),
    );
    const parsed = UpdatePreferencesZ.safeParse(config.updates);
    if (parsed.success) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.data));
  } catch {
    // No config.json yet, or no localStorage.
  }
}

export async function setUpdatePreferences(value: UpdatePreferences): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // No localStorage.
  }
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      const data = await readConfigForUpdate(path);
      data.updates = value;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    logError("settings.updates.persist_failed", err);
  }
}
