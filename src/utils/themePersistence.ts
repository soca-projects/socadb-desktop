import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { queueConfigWrite, readConfigForUpdate, socadbConfigPath } from "./socadbDir";
import { ThemePreferenceZ } from "./zodSchemas";
import { logError } from "./log";
import { useThemeStore, type ThemePreference } from "../stores/themeStore";

const ConfigZ = z.record(z.string(), z.unknown());

async function loadTheme() {
  try {
    const config = ConfigZ.parse(
      JSON.parse(await readTextFile(await socadbConfigPath())),
    );
    const parsed = ThemePreferenceZ.safeParse(config.theme);
    if (parsed.success) useThemeStore.getState().setPreference(parsed.data, false);
  } catch {
    // No config.json yet: keep the preference localStorage gave.
  }
}

async function saveTheme(preference: ThemePreference) {
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      const data = await readConfigForUpdate(path);
      data.theme = preference;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    logError("settings.theme.persist_failed", err);
  }
}

let initialized = false;

export function initThemePersistence() {
  if (initialized) return;
  initialized = true;
  void loadTheme().finally(() =>
    useThemeStore.subscribe((state, prev) => {
      if (state.preference !== prev.preference) void saveTheme(state.preference);
    }),
  );
}
