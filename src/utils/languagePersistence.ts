import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { queueConfigWrite, readConfigForUpdate, socadbConfigPath } from "./socadbDir";
import { logError } from "./log";
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
      const data = await readConfigForUpdate(path);
      data.language = lng;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    logError("settings.language.persist_failed", err);
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
