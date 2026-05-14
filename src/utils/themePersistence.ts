import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { queueConfigWrite, socadbConfigPath } from "./socadbDir";
import { useThemeStore } from "../stores/themeStore";

async function loadTheme() {
  try {
    const content = await readTextFile(await socadbConfigPath());
    const data = JSON.parse(content) as Record<string, unknown>;
    if (data.theme === "light" || data.theme === "dark") {
      useThemeStore.getState().setTheme(data.theme);
    }
  } catch {
    // No config.json yet — keep whatever localStorage/system gave us via
    // getInitialTheme(). Do NOT call setTheme here, otherwise the system
    // preference would overwrite the user's last choice from localStorage.
  }
}

async function saveTheme() {
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      let data: Record<string, unknown> = {};
      try {
        const content = await readTextFile(path);
        data = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // First save: file doesn't exist yet, start from empty object.
      }
      data.theme = useThemeStore.getState().theme;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    console.warn("[themePersistence] failed to persist theme:", err);
  }
}

let initialized = false;

export function initThemePersistence() {
  if (initialized) return;
  initialized = true;
  void loadTheme();
  useThemeStore.subscribe(saveTheme);
}
