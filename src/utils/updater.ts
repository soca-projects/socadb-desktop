import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";
import i18next from "../i18n";
import { useUpdateStore, type UpdateStatus } from "../stores/updateStore";
import { toMessage } from "./errorMessage";
import { IS_MAC } from "./platform";
import {
  sparkleCheckInBackground,
  sparkleInstallPendingUpdate,
  sparklePendingVersion,
  sparkleSessionInProgress,
  type SparkleCycleError,
} from "./sparkle";

// Sparkle quits the app before installing: still running after this means the
// quit never happened.
const MAC_QUIT_TIMEOUT_MS = 30_000;

let userRequestedCheck = false;

function takeUserRequest(): boolean {
  const requested = userRequestedCheck;
  userRequestedCheck = false;
  return requested;
}

async function notifyUpToDate() {
  const version = await getVersion();
  toast.success(i18next.t("updater.upToDate", { version }));
}

function notifyCheckFailed(message: string) {
  toast.error(i18next.t("updater.checkFailed", { error: message }));
}

export async function checkForUpdates({ userInitiated }: { userInitiated: boolean }) {
  const { status } = useUpdateStore.getState();
  if (status !== "idle" && status !== "error") return;
  if (userInitiated) userRequestedCheck = true;

  if (IS_MAC) {
    await sparkleCheck();
  } else {
    await tauriCheckAndDownload();
  }
}

async function sparkleCheck() {
  const store = useUpdateStore.getState();
  store.setStatus("checking");
  try {
    // Sparkle keeps a staged update across a failed install or a WebView reload.
    const staged = await sparklePendingVersion();
    if (staged) {
      handleSparkleUpdateStaged(staged);
      return;
    }
    // A scheduled check may be running; its outcome arrives through the same events.
    if (!(await sparkleSessionInProgress())) {
      await sparkleCheckInBackground();
    }
  } catch (error) {
    const message = toMessage(error);
    // No .app bundle under `tauri dev`.
    if (import.meta.env.DEV && message.includes("Updater not ready")) {
      takeUserRequest();
      store.setStatus("idle");
      return;
    }
    console.error("[updater] sparkle check failed:", message);
    store.setError(message);
    if (takeUserRequest()) notifyCheckFailed(message);
  }
}

async function tauriCheckAndDownload() {
  const store = useUpdateStore.getState();
  store.setStatus("checking");
  try {
    const update = await check();
    if (!update) {
      store.setStatus("idle");
      if (takeUserRequest()) await notifyUpToDate();
      return;
    }

    store.setUpdateAvailable(update.version, update);

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

    takeUserRequest();
    useUpdateStore.getState().setStatus("ready");
  } catch (error) {
    const message = toMessage(error);
    console.error("[updater] check/download failed:", message);
    useUpdateStore.getState().setError(message);
    if (takeUserRequest()) notifyCheckFailed(message);
  }
}

export function handleSparkleUpdateFound(version: string) {
  useUpdateStore.getState().setUpdateAvailable(version, null);
}

export function handleSparkleUpdateStaged(version: string) {
  takeUserRequest();
  useUpdateStore.getState().setReady(version);
}

// Sparkle ends a cycle when nothing was staged, or when a staged update fails.
export function handleSparkleCycleFinished(error: SparkleCycleError | null) {
  const store = useUpdateStore.getState();
  const userInitiated = takeUserRequest();
  const hadStagedUpdate = store.status === "ready" || store.status === "installing";

  if (error && !error.noUpdate) {
    console.error("[updater] sparkle update failed:", error.message);
    store.setError(error.message);
    if (hadStagedUpdate) {
      toast.error(i18next.t("updater.failed", { error: error.message }), {
        duration: Infinity,
      });
    } else if (userInitiated) {
      notifyCheckFailed(error.message);
    }
    return;
  }

  store.setStatus("idle");
  if (error?.noUpdate && userInitiated) void notifyUpToDate();
}

export async function installAndRelaunch() {
  const { update, setStatus, setError } = useUpdateStore.getState();
  setStatus("installing");
  try {
    if (IS_MAC) {
      if (!(await sparkleInstallPendingUpdate())) {
        throw new Error("No update is staged");
      }
      await new Promise((resolve) => setTimeout(resolve, MAC_QUIT_TIMEOUT_MS));
      throw new Error(`SocaDB did not quit within ${MAC_QUIT_TIMEOUT_MS / 1000}s`);
    }
    if (!update) throw new Error("No update is downloaded");
    await update.install();
    await relaunch();
  } catch (error) {
    const message = toMessage(error);
    console.error("[updater] install failed:", message);
    setError(message);
    toast.error(i18next.t("updater.failed", { error: message }), {
      duration: Infinity,
    });
  }
}

export function updateMenuItemState(status: UpdateStatus): {
  text: string;
  enabled: boolean;
} {
  // Menus read a single & as a mnemonic marker.
  const t = (key: string) => i18next.t(key).replaceAll("&", "&&");
  switch (status) {
    case "checking":
      return { text: t("menu.checkingForUpdates"), enabled: false };
    case "downloading":
      return { text: t("menu.downloadingUpdate"), enabled: false };
    case "ready":
      return { text: t("updater.restartNow"), enabled: true };
    case "installing":
      return { text: t("updater.installing"), enabled: false };
    default:
      return { text: t("menu.checkForUpdates"), enabled: true };
  }
}

export function handleUpdateMenuAction() {
  if (useUpdateStore.getState().status === "ready") {
    void installAndRelaunch();
  } else {
    void checkForUpdates({ userInitiated: true });
  }
}
