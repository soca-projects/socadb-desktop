import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_MAC } from "../utils/platform";
import { installOnClose } from "../utils/updater";

export function useInstallOnNextLaunch() {
  useEffect(() => {
    if (IS_MAC) return;

    const unlistenPromise = getCurrentWindow().onCloseRequested(installOnClose);

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
