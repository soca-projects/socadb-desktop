import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import i18next from "../i18n";
import { isLanguage } from "../i18n";

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

async function loadLanguage() {
  try {
    const content = await readTextFile(await configPath());
    const data = JSON.parse(content) as Record<string, unknown>;
    if (isLanguage(data.language) && data.language !== i18next.resolvedLanguage) {
      void i18next.changeLanguage(data.language);
    }
  } catch {
    // config.json doesn't exist yet
  }
}

async function saveLanguage(lng: string) {
  localStorage.setItem("socadb_language", lng);
  try {
    const path = await configPath();
    let data: Record<string, unknown> = {};
    try {
      const content = await readTextFile(path);
      data = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // file doesn't exist yet
    }
    data.language = lng;
    await invoke("atomic_write", { path, content: JSON.stringify(data) });
  } catch {
    // write failed
  }
}

let initialized = false;

export function initLanguagePersistence() {
  if (initialized) return;
  initialized = true;
  void loadLanguage();
  i18next.on("languageChanged", (lng: string) => {
    void saveLanguage(lng);
  });
}
