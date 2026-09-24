import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { checkForUpdatesInBackground } from "tauri-plugin-sparkle-updater-api";
import { useUpdateStore } from "../stores/updateStore";
import { toMessage } from "../utils/errorMessage";
import { IS_MAC } from "../utils/platform";

const POLL_INTERVAL_MS = 30 * 60 * 1000;

async function sparkleBackgroundCheck() {
  try {
    await checkForUpdatesInBackground();
  } catch (error) {
    const message = toMessage(error);
    // Only `tauri dev` may fail silently (no .app bundle); anything else is a
    // real misconfiguration and must surface.
    if (import.meta.env.DEV && message.includes("UpdaterNotReady")) return;
    console.error("[updater] sparkle background check failed:", message);
  }
}

async function tauriCheckAndDownload() {
  const store = useUpdateStore.getState();
  if (store.status !== "idle" && store.status !== "error") return;

  store.setStatus("checking");
  try {
    const update = await check();
    if (!update) {
      store.setStatus("idle");
      return;
    }

    store.setUpdateAvailable(update);

    let downloaded = 0;
    let total: number | null = null;
    await update.download((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
        useUpdateStore.getState().setProgress(0, total);
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        useUpdateStore.getState().setProgress(downloaded, total);
      }
    });

    useUpdateStore.getState().setStatus("ready");
  } catch (error) {
    const message = toMessage(error);
    console.error("[updater] check/download failed:", message);
    useUpdateStore.getState().setError(message);
  }
}

export function useAutoUpdate() {
  const didStart = useRef(false);

  useEffect(() => {
    if (didStart.current) return;
    didStart.current = true;

    if (IS_MAC) {
      // Sparkle schedules later checks itself.
      void sparkleBackgroundCheck();
      return;
    }

    void tauriCheckAndDownload();

    const interval = setInterval(() => {
      void tauriCheckAndDownload();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
