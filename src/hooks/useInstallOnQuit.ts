import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import i18next from "../i18n";
import { useUpdateStore } from "../stores/updateStore";
import { toMessage } from "../utils/errorMessage";

export function useInstallOnQuit() {
  useEffect(() => {
    const window = getCurrentWindow();
    const unlistenPromise = window.onCloseRequested(async (event) => {
      const {
        status,
        pendingUpdateVersion,
        update,
        setStatus,
        setPendingUpdateVersion,
        setError,
      } = useUpdateStore.getState();

      if (status === "installing") {
        event.preventDefault();
        return;
      }

      if (!update || pendingUpdateVersion !== update.version) return;

      event.preventDefault();
      setStatus("installing");
      try {
        await update.install();
        setPendingUpdateVersion(null);
        await window.destroy();
      } catch (error) {
        const message = toMessage(error);
        console.error("[updater] install on quit failed:", message);
        setError(message);
        setPendingUpdateVersion(null);
        toast.error(i18next.t("updater.failed", { error: message }), {
          duration: Infinity,
        });
      }
    });

    return () => {
      unlistenPromise
        .then((unlisten) => {
          unlisten();
        })
        .catch(() => {
          // ignore — listener never attached
        });
    };
  }, []);
}
