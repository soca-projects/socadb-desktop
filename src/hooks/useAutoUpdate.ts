import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import i18next from "../i18n";
import { useSchemaStore } from "../stores/schemaStore";
import { saveCurrentSchema } from "../utils/fileOperations";

async function showUpdateDialog(version: string): Promise<boolean> {
  const t = i18next.t;
  return ask(t("updater.description", { version }), {
    title: t("updater.title"),
    okLabel: t("updater.install"),
    cancelLabel: t("updater.later"),
    kind: "info",
  });
}

export function useAutoUpdate() {
  const didCheck = useRef(false);

  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;

    async function checkForUpdate() {
      try {
        const update = await check();
        if (!update) return;

        const yes = await showUpdateDialog(update.version);
        if (!yes) return;

        const { schema, savedAt } = useSchemaStore.getState();
        if (savedAt !== schema.updatedAt) {
          await saveCurrentSchema();
        }

        await update.downloadAndInstall();
        await relaunch();
      } catch {
        // Silent fail — updater not configured or no network
      }
    }

    void checkForUpdate();
  }, []);
}
