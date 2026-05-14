import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { queueConfigWrite, socadbConfigPath } from "./socadbDir";
import i18next from "../i18n";
import { isLanguage } from "../i18n";

async function loadLanguage() {
  try {
    const content = await readTextFile(await socadbConfigPath());
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
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      let data: Record<string, unknown> = {};
      try {
        const content = await readTextFile(path);
        data = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // First save: file doesn't exist yet, start from empty object.
      }
      data.language = lng;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    console.warn("[languagePersistence] failed to persist language:", err);
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
