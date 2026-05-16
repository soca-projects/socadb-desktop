import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { queueConfigWrite, socadbConfigPath } from "./socadbDir";
import { useUpdateStore } from "../stores/updateStore";

async function loadPendingUpdateVersion() {
  try {
    const content = await readTextFile(await socadbConfigPath());
    const data = JSON.parse(content) as Record<string, unknown>;
    if (typeof data.pendingUpdateVersion === "string") {
      useUpdateStore.setState({ pendingUpdateVersion: data.pendingUpdateVersion });
    }
  } catch {
    // No config.json yet — leave default (null).
  }
}

async function savePendingUpdateVersion() {
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      let data: Record<string, unknown> = {};
      try {
        const content = await readTextFile(path);
        data = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // First save: file doesn't exist yet.
      }
      const version = useUpdateStore.getState().pendingUpdateVersion;
      if (version === null) {
        delete data.pendingUpdateVersion;
      } else {
        data.pendingUpdateVersion = version;
      }
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    console.warn("[updaterPersistence] failed to persist pendingUpdateVersion:", err);
  }
}

let initialized = false;
let hydrated = false;
let lastVersion: string | null = null;

async function hydrate() {
  await loadPendingUpdateVersion();
  lastVersion = useUpdateStore.getState().pendingUpdateVersion;
  hydrated = true;
}

export function initUpdaterPersistence() {
  if (initialized) return;
  initialized = true;
  void hydrate();
  useUpdateStore.subscribe((state) => {
    if (!hydrated) return;
    if (state.pendingUpdateVersion !== lastVersion) {
      lastVersion = state.pendingUpdateVersion;
      void savePendingUpdateVersion();
    }
  });
}
