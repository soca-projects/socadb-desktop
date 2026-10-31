import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { BundleType, getBundleType, getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";
import i18next from "../i18n";
import {
  useUpdateStore,
  type AfterDownload,
  type UpdateStatus,
} from "../stores/updateStore";
import { stopAllAgents } from "./chatCommands";
import { toMessage } from "./errorMessage";
import { logError, logInfo, logWarn } from "./log";
import { IS_MAC, IS_WINDOWS } from "./platform";
import { clearRelaunchMark, markRelaunch } from "./relaunchMark";
import {
  sparkleCheckInformation,
  sparkleDownloadInBackground,
  sparkleInstallPendingUpdate,
  sparklePendingVersion,
  sparkleSessionInProgress,
  type SparkleCycleError,
} from "./sparkle";
import {
  asksBeforeDownloading,
  getUpdatePreferences,
  loadUpdatePreferences,
} from "./updatePreferences";

export const CHANGELOG_URL = "https://socadb.com/changelog";
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Sparkle quits the app before installing: still running after this means the
// quit never happened.
const MAC_QUIT_TIMEOUT_MS = 30_000;

// An accepted download dies with the app: the next launch resumes it without
// asking again.
const ACCEPTED_KEY = "socadb_update_accepted";

let userRequestedCheck = false;
let sparkleProbing = false;

function acceptedVersion(): string | null {
  try {
    return localStorage.getItem(ACCEPTED_KEY);
  } catch {
    return null;
  }
}

function rememberAccepted(version: string | null) {
  try {
    if (version === null) localStorage.removeItem(ACCEPTED_KEY);
    else localStorage.setItem(ACCEPTED_KEY, version);
  } catch {
    // No localStorage.
  }
}

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

function notifyInstallFailed(message: string) {
  toast.error(i18next.t("updater.failed", { error: message }), {
    duration: Infinity,
  });
}

export async function startUpdates() {
  if (acceptedVersion() === (await getVersion())) rememberAccepted(null);
  await loadUpdatePreferences();
  await detectInstallOnQuit();
  await runScheduledCheck();
}

// The updater installs .deb and .rpm packages through a password prompt, which
// must not open while the user is leaving.
async function detectInstallOnQuit() {
  if (IS_MAC || IS_WINDOWS) return;
  try {
    const bundle = await getBundleType();
    useUpdateStore
      .getState()
      .setCanInstallOnQuit(bundle !== BundleType.Deb && bundle !== BundleType.Rpm);
  } catch (error) {
    logWarn("updater.bundle_type.failed", error);
  }
}

export function runScheduledCheck(): Promise<void> {
  if (!getUpdatePreferences().autoCheck) return Promise.resolve();
  return checkForUpdates({ userInitiated: false });
}

export async function checkForUpdates({ userInitiated }: { userInitiated: boolean }) {
  const { status } = useUpdateStore.getState();
  if (status !== "idle" && status !== "error") return;
  if (userInitiated) userRequestedCheck = true;

  const askFirst = asksBeforeDownloading(getUpdatePreferences());
  if (IS_MAC) {
    await sparkleCheck(askFirst);
  } else {
    await tauriCheck(askFirst);
  }
}

async function sparkleCheck(askFirst: boolean) {
  const store = useUpdateStore.getState();
  store.setStatus("checking");
  try {
    // Sparkle keeps a staged update across a failed install or a WebView reload.
    const staged = await sparklePendingVersion();
    if (staged) {
      handleSparkleUpdateStaged(staged);
      return;
    }
    // A download started before a WebView reload reports through the same events.
    if (await sparkleSessionInProgress()) return;
    sparkleProbing = askFirst;
    if (askFirst) {
      await sparkleCheckInformation();
    } else {
      await sparkleDownloadInBackground();
    }
  } catch (error) {
    const message = toMessage(error);
    // No .app bundle under `tauri dev`.
    if (import.meta.env.DEV && message.includes("Updater not ready")) {
      takeUserRequest();
      store.setStatus("idle");
      return;
    }
    logError("updater.sparkle.check_failed", message);
    store.setError(message);
    if (takeUserRequest()) notifyCheckFailed(message);
  }
}

async function tauriCheck(askFirst: boolean) {
  const store = useUpdateStore.getState();
  store.setStatus("checking");
  try {
    const update = await check();
    if (!update) {
      store.setStatus("idle");
      if (takeUserRequest()) await notifyUpToDate();
      return;
    }
    logInfo("updater.available", update.version);
    if (askFirst) {
      takeUserRequest();
      store.setAvailable(update.version, update);
      if (update.version === acceptedVersion()) await resumeAcceptedDownload();
      return;
    }
    await tauriDownload(update);
    takeUserRequest();
    onUpdateReady(update.version);
  } catch (error) {
    const message = toMessage(error);
    logError("updater.check.failed", error);
    useUpdateStore.getState().setError(message);
    if (takeUserRequest()) notifyCheckFailed(message);
  }
}

async function tauriDownload(update: Update) {
  useUpdateStore.getState().setDownloading(update.version, update);
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
}

function onUpdateReady(version: string) {
  const store = useUpdateStore.getState();
  const { afterDownload, canInstallOnQuit } = store;
  store.setReady(version);
  store.setAfterDownload(null);
  if (afterDownload === "restart") {
    void installAndRelaunch();
    return;
  }
  if (canInstallOnQuit) store.setPendingUpdateVersion(version);
  if (afterDownload === "quit") store.setDismissedVersion(version);
}

export function downloadAvailableUpdate(choice: AfterDownload): Promise<void> {
  return acceptAndDownload(choice);
}

function resumeAcceptedDownload(): Promise<void> {
  return acceptAndDownload(useUpdateStore.getState().canInstallOnQuit ? "quit" : null);
}

async function acceptAndDownload(choice: AfterDownload | null) {
  const store = useUpdateStore.getState();
  const { status, version, update } = store;
  if (status !== "available" || !version) return;
  rememberAccepted(version);
  store.setAfterDownload(choice);
  if (choice === "quit") store.setDismissedVersion(version);
  try {
    if (IS_MAC) {
      store.setDownloading(version, null);
      sparkleProbing = false;
      if (!(await sparkleDownloadInBackground())) {
        throw new Error("Another update session is in progress");
      }
      return;
    }
    if (!update) throw new Error("No update to download");
    await tauriDownload(update);
    onUpdateReady(update.version);
  } catch (error) {
    const message = toMessage(error);
    logError("updater.download.failed", error);
    useUpdateStore.getState().setError(message);
    notifyInstallFailed(message);
  }
}

export function dismissUpdate() {
  const { version, setDismissedVersion } = useUpdateStore.getState();
  setDismissedVersion(version);
}

export function handleSparkleUpdateFound(version: string) {
  logInfo("updater.available", version);
  const store = useUpdateStore.getState();
  if (sparkleProbing) {
    store.setAvailable(version, null);
    // The download resumes once the probe's cycle ends.
    if (version === acceptedVersion()) store.setDismissedVersion(version);
  } else {
    store.setDownloading(version, null);
  }
}

export function handleSparkleUpdateStaged(version: string) {
  takeUserRequest();
  onUpdateReady(version);
}

// Sparkle ends a cycle when nothing was staged, when a probe found an update,
// or when a staged update fails.
export function handleSparkleCycleFinished(error: SparkleCycleError | null) {
  sparkleProbing = false;
  const store = useUpdateStore.getState();
  const userInitiated = takeUserRequest();
  const userAccepted = store.afterDownload !== null;
  const hadStagedUpdate = store.status === "ready" || store.status === "installing";

  if (error && !error.noUpdate) {
    logError("updater.sparkle.update_failed", error.message);
    store.setError(error.message);
    if (hadStagedUpdate || userAccepted) {
      notifyInstallFailed(error.message);
    } else if (userInitiated) {
      notifyCheckFailed(error.message);
    }
    return;
  }

  if (store.status === "available") {
    if (store.version === acceptedVersion()) void resumeAcceptedDownload();
    return;
  }
  store.setAfterDownload(null);
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
    // The updater quits the app without its exit cleanup: an agent still
    // answering would leave its CLI running, holding files the installer replaces.
    await stopAllAgents();
    // Windows quits inside install() and its installer relaunches SocaDB; Linux
    // comes back here once installed.
    if (IS_WINDOWS) await markRelaunch();
    await update.install();
    if (!IS_WINDOWS) await markRelaunch();
    await relaunch();
  } catch (error) {
    if (!IS_MAC) void clearRelaunchMark();
    const message = toMessage(error);
    logError("updater.install.failed", error);
    setError(message);
    notifyInstallFailed(message);
  }
}

interface ToastState {
  status: UpdateStatus;
  version: string | null;
  dismissedVersion: string | null;
  afterDownload: AfterDownload | null;
}

// Toasts sit above modals: at the minimum window size an offer would cover the
// release notes. Progress stays, being the only sign of a download or install.
export function updateToastShown(state: ToastState, notesOpen = false): boolean {
  switch (state.status) {
    case "installing":
      return true;
    case "downloading":
      return state.afterDownload === "restart";
    case "available":
    case "ready":
      return (
        !notesOpen && state.version !== null && state.dismissedVersion !== state.version
      );
    default:
      return false;
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

export function updateButtonState(status: UpdateStatus): {
  labelKey: string;
  enabled: boolean;
} {
  switch (status) {
    case "checking":
      return { labelKey: "settings.updatesChecking", enabled: false };
    case "downloading":
      return { labelKey: "updater.downloading", enabled: false };
    case "available":
      return { labelKey: "settings.updatesShow", enabled: true };
    case "ready":
      return { labelKey: "updater.restartNow", enabled: true };
    case "installing":
      return { labelKey: "updater.installing", enabled: false };
    default:
      return { labelKey: "settings.updatesCheckNow", enabled: true };
  }
}

export function handleUpdateMenuAction() {
  const store = useUpdateStore.getState();
  if (store.status === "ready") {
    void installAndRelaunch();
  } else if (store.status === "available") {
    store.setDismissedVersion(null);
  } else {
    void checkForUpdates({ userInitiated: true });
  }
}
