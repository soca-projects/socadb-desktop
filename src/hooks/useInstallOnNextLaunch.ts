import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import i18next from "../i18n";
import { useUpdateStore } from "../stores/updateStore";
import { toMessage } from "../utils/errorMessage";
import { IS_MAC } from "../utils/platform";

// Tauri's plugin-updater install runs in the calling process on Linux/AppImage
// (file swap). If it hangs — auth prompt, disk wait, signature check — the
// preventDefault below traps the user's close click indefinitely. 30s is
// generous for a healthy AppImage swap (typically <5s) but short enough to
// release the user before frustration sets in.
const INSTALL_TIMEOUT_MS = 30_000;

// Triggers the deferred install (set via UpdateReadyToast → "Install on Next
// Launch") when the user closes the window on Windows/Linux. Skipped on macOS
// where Sparkle handles the install-on-quit lifecycle natively via
// SUAutomaticallyUpdate. Skipping macOS here also avoids the previous bug
// where tauri-plugin-updater's in-process install would hang and lock the
// window — Sparkle uses a detached XPC sidecar so the close is never blocked.
export function useInstallOnNextLaunch() {
  useEffect(() => {
    if (IS_MAC) return;

    const window = getCurrentWindow();
    // pendingUpdateVersion stays set until install() settles, so a second close
    // click would otherwise start a concurrent install. Bounded by the timeout.
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
        // On Windows, update.install() asks Tauri to quit the app and start
        // the NSIS installer — this line is rarely reached because the
        // process exits first. On Linux/AppImage, the swap is fast enough
        // that we destroy the window ourselves after.
        setPendingUpdateVersion(null);
        await window.destroy();
      } catch (error) {
        const message = toMessage(error);
        console.error("[updater] install on next launch failed:", message);
        setError(message);
        setPendingUpdateVersion(null);
        toast.error(i18next.t("updater.failed", { error: message }), {
          duration: Infinity,
        });
        // The error path leaves status="error", so the next close click is
        // not preventDefaulted and the user gets out — no need to call
        // window.destroy() ourselves.
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
