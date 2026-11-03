import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_MAC } from "../utils/platform";
import { handleCloseRequested } from "../utils/windowClose";

export function useInstallOnNextLaunch() {
  useEffect(() => {
    if (IS_MAC) return;

    const unlistenPromise = getCurrentWindow().onCloseRequested(handleCloseRequested);

    return () => {
      unlistenPromise
        .then((unlisten) => {
          unlisten();
        })
        .catch(() => {
          // listener never attached
        });
    };
  }, []);
}
