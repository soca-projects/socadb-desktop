import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import i18next from "../i18n";
import { useUpdateStore } from "../stores/updateStore";
import { toMessage } from "../utils/errorMessage";
import { logError } from "../utils/log";
import { IS_MAC, IS_WINDOWS } from "../utils/platform";
import { clearRelaunchMark, markRelaunch } from "../utils/relaunchMark";

// install() runs in-process on Linux; if it hangs, the preventDefault below
// would trap the close click forever.
const INSTALL_TIMEOUT_MS = 30_000;

export function useInstallOnNextLaunch() {
  useEffect(() => {
    if (IS_MAC) return;

    const window = getCurrentWindow();
    // Not the store status: "Restart now" also sets it, without a timeout,
    // and guarding on it could block closing indefinitely.
    let installing = false;
    const unlistenPromise = window.onCloseRequested(async (event) => {
      if (installing) {
        event.preventDefault();
        return;
      }

      const {
        update,
        pendingUpdateVersion,
        setStatus,
        setPendingUpdateVersion,
        setError,
      } = useUpdateStore.getState();

      if (!update || pendingUpdateVersion !== update.version) return;

      event.preventDefault();
      installing = true;
      setStatus("installing");
      try {
        // The Windows installer starts SocaDB again once done; Linux doesn't.
        if (IS_WINDOWS) await markRelaunch();
        await Promise.race([
          update.install(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Install timed out after ${INSTALL_TIMEOUT_MS / 1000}s`),
                ),
              INSTALL_TIMEOUT_MS,
            ),
          ),
        ]);
        // Windows exits inside install(); Linux gets here and closes itself.
        setPendingUpdateVersion(null);
        await window.destroy();
      } catch (error) {
        if (IS_WINDOWS) void clearRelaunchMark();
        const message = toMessage(error);
        logError("updater.install_on_launch.failed", message);
        setError(message);
        setPendingUpdateVersion(null);
        toast.error(i18next.t("updater.failed", { error: message }), {
          duration: Infinity,
        });
      } finally {
        installing = false;
      }
    });

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
