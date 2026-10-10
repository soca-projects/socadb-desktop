import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { queueConfigWrite, socadbConfigPath } from "./socadbDir";
import { StartupPreferenceZ } from "./zodSchemas";
import type { View } from "../stores/viewStore";

export type StartupPreference = z.infer<typeof StartupPreferenceZ>;

const STORAGE_KEY = "socadb_startup";
const ConfigZ = z.record(z.string(), z.unknown());

// Read synchronously so the first screen doesn't flash; config.json only
// refills localStorage when WebKit storage was cleared.
export function getStartupPreference(): StartupPreference {
  try {
    const parsed = StartupPreferenceZ.safeParse(localStorage.getItem(STORAGE_KEY));
    if (parsed.success) return parsed.data;
  } catch {
    // No localStorage.
  }
  return "home";
}

export function initialView(restored: boolean, preference: StartupPreference): View {
  return restored && preference === "lastSchema" ? "editor" : "home";
}

export async function loadStartupPreference(): Promise<void> {
  try {
    const config = ConfigZ.parse(
      JSON.parse(await readTextFile(await socadbConfigPath())),
    );
    const parsed = StartupPreferenceZ.safeParse(config.startup);
    if (parsed.success) localStorage.setItem(STORAGE_KEY, parsed.data);
  } catch {
    // No config.json yet, or no localStorage.
  }
}

export async function setStartupPreference(value: StartupPreference): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // No localStorage.
  }
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      let content: string | null = null;
      try {
        content = await readTextFile(path);
      } catch {
        // First save: config.json doesn't exist yet.
      }
      // A config.json that doesn't parse throws here: rewriting it with only
      // this key would drop every other setting.
      const data = content === null ? {} : ConfigZ.parse(JSON.parse(content));
      data.startup = value;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    console.warn("[startupPreference] failed to persist:", err);
  }
}
