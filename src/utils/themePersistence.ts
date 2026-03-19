import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useThemeStore } from "../stores/themeStore";

let socadbDir: string | null = null;

async function getSocadbDir(): Promise<string> {
  if (!socadbDir) {
    const home = await homeDir();
    socadbDir = `${home}.socadb/`;
  }
  return socadbDir;
}

async function configPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}config.json`;
}

async function loadTheme() {
  try {
    const content = await readTextFile(await configPath());
    const data = JSON.parse(content) as Record<string, unknown>;
    if (data.theme === "light" || data.theme === "dark") {
      useThemeStore.getState().setTheme(data.theme);
      return;
    }
  } catch {
    // config.json doesn't exist yet
  }

  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  useThemeStore.getState().setTheme(prefersLight ? "light" : "dark");
}

async function saveTheme() {
  try {
    const path = await configPath();
    let data: Record<string, unknown> = {};
    try {
      const content = await readTextFile(path);
      data = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // file doesn't exist yet
    }
    data.theme = useThemeStore.getState().theme;
    await writeTextFile(path, JSON.stringify(data));
  } catch {
    // write failed
  }
}

export function initThemePersistence() {
  void loadTheme();
  useThemeStore.subscribe(saveTheme);
}
