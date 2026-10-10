import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import i18next from "../i18n";
import { useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import { getSocaFilter } from "./fileOperations";
import type { HomeSort } from "./homeList";
import { handleOpenRecent } from "./menuActions";
import { addRecentFile, removeRecentFiles, replaceRecentFile } from "./recentFiles";
import { HomeSortZ } from "./zodSchemas";

const SORT_KEY = "socadb_home_sort";

export function getHomeSort(): HomeSort {
  try {
    const parsed = HomeSortZ.safeParse(localStorage.getItem(SORT_KEY));
    if (parsed.success) return parsed.data;
  } catch {
    // No localStorage.
  }
  return "opened";
}

export function setHomeSort(sort: HomeSort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // No localStorage.
  }
}

export function openHomeEntry(path: string) {
  if (useSchemaStore.getState().filePath === path) {
    useViewStore.getState().showEditor();
    return;
  }
  handleOpenRecent(path);
}

export function resumeCurrentSchema() {
  useViewStore.getState().showEditor();
}

export async function revealHomeEntry(path: string) {
  try {
    await revealItemInDir(path);
  } catch (e) {
    toast.error(i18next.t("home.revealFailed", { error: String(e) }));
  }
}

// Rejects with the Rust error code ("exists", "invalid_name", …) for the dialog.
export async function renameHomeEntry(path: string, name: string) {
  const next = await invoke<string>("rename_schema_file", { path, newName: name });
  replaceRecentFile(path, next);
  const store = useSchemaStore.getState();
  if (store.filePath === path) store.setFilePath(next);
}

export async function duplicateHomeEntry(path: string) {
  try {
    const copy = await invoke<string>("duplicate_schema_file", {
      path,
      copyLabel: i18next.t("home.copySuffix"),
    });
    addRecentFile(copy);
  } catch (e) {
    toast.error(i18next.t("home.duplicateFailed", { error: String(e) }));
  }
}

export async function locateHomeEntry(path: string) {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [getSocaFilter()],
  });
  if (selected) replaceRecentFile(path, selected);
}

export function removeHomeEntries(paths: readonly string[]) {
  removeRecentFiles(paths);
}
