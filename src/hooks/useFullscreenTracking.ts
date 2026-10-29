import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useWindowStore } from "../stores/windowStore";

export function useFullscreenTracking() {
  useEffect(() => {
    const win = getCurrentWindow();
    const { reportFullscreen, startExitingFullscreen } = useWindowStore.getState();
    const report = () => void win.isFullscreen().then(reportFullscreen);
    report();
    const unlistens = [
      win.onResized(report),
      listen("will-exit-fullscreen", startExitingFullscreen),
    ];
    return () => {
      for (const u of unlistens) void u.then((fn) => fn());
    };
  }, []);
}
