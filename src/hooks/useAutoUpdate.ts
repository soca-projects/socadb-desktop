import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { useUpdateStore } from "../stores/updateStore";
import { toMessage } from "../utils/errorMessage";

const POLL_INTERVAL_MS = 30 * 60 * 1000;

async function runCheckAndDownload() {
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

    void runCheckAndDownload();

    const interval = setInterval(() => {
      void runCheckAndDownload();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
