import { describe, it, expect, beforeEach, vi } from "vitest";

const env = vi.hoisted(() => {
  // updateStore exposes itself on window in dev builds.
  Object.assign(globalThis, { window: globalThis });
  return {
    isMac: true,
    isWindows: false,
    preferences: { autoCheck: true, autoInstall: true },
  };
});

vi.mock("./platform", () => ({
  get IS_MAC() {
    return env.isMac;
  },
  IS_LINUX: false,
  get IS_WINDOWS() {
    return env.isWindows;
  },
}));

vi.mock("../i18n", () => ({
  default: { t: (key: string) => key },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.1.3")),
  getBundleType: vi.fn(() => Promise.resolve("appimage")),
  BundleType: { Deb: "deb", Rpm: "rpm" },
}));

vi.mock("./updatePreferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./updatePreferences")>()),
  getUpdatePreferences: () => env.preferences,
  loadUpdatePreferences: vi.fn(() => Promise.resolve()),
}));

vi.mock("./relaunchMark", () => ({
  markRelaunch: vi.fn(() => Promise.resolve()),
  clearRelaunchMark: vi.fn(() => Promise.resolve()),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("./chatCommands", () => ({
  stopAllAgents: vi.fn(() => Promise.resolve()),
}));

interface FakeUpdate {
  version: string;
  download: () => Promise<void>;
  install?: () => Promise<void>;
}

const check = vi.hoisted(() => vi.fn<() => Promise<FakeUpdate | null>>());

vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

vi.mock("./sparkle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sparkle")>()),
  sparklePendingVersion: vi.fn(() => Promise.resolve(null)),
  sparkleSessionInProgress: vi.fn(() => Promise.resolve(false)),
  sparkleCheckInformation: vi.fn(() => Promise.resolve()),
  sparkleDownloadInBackground: vi.fn(() => Promise.resolve(true)),
  sparkleInstallPendingUpdate: vi.fn(() => Promise.resolve(true)),
}));

import { toast } from "sonner";
import { getBundleType } from "@tauri-apps/api/app";
import { useUpdateStore } from "../stores/updateStore";
import { stopAllAgents } from "./chatCommands";
import {
  parseCycleFinishedPayload,
  sparkleCheckInformation,
  sparkleDownloadInBackground,
  sparkleInstallPendingUpdate,
  sparklePendingVersion,
  sparkleSessionInProgress,
} from "./sparkle";
import {
  checkForUpdates,
  dismissUpdate,
  downloadAvailableUpdate,
  handleSparkleCycleFinished,
  handleSparkleUpdateFound,
  handleSparkleUpdateStaged,
  handleUpdateMenuAction,
  installAndRelaunch,
  runScheduledCheck,
  startUpdates,
  updateMenuItemState,
  updateToastShown,
} from "./updater";

const noUpdate = { message: "You're up to date!", noUpdate: {} };

function resetStore() {
  useUpdateStore.setState({
    status: "idle",
    downloaded: 0,
    total: null,
    error: null,
    version: null,
    update: null,
    pendingUpdateVersion: null,
    dismissedVersion: null,
    afterDownload: null,
    canInstallOnQuit: true,
  });
}

const storage = new Map<string, string>();
const neverSettles = new Promise<void>((resolve) => void resolve);

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});

function toastShown() {
  return updateToastShown(useUpdateStore.getState());
}

describe("updater on macOS", () => {
  beforeEach(() => {
    env.isMac = true;
    env.preferences = { autoCheck: true, autoInstall: true };
    resetStore();
    vi.clearAllMocks();
  });

  it("downloads in the background when updates install automatically", async () => {
    await checkForUpdates({ userInitiated: false });
    expect(sparkleDownloadInBackground).toHaveBeenCalledOnce();
    expect(sparkleCheckInformation).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("checking");
  });

  it("only looks for an update when the user installs it", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    await checkForUpdates({ userInitiated: false });
    expect(sparkleCheckInformation).toHaveBeenCalledOnce();
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
    handleSparkleUpdateFound("0.1.4");
    handleSparkleCycleFinished(null);
    expect(useUpdateStore.getState()).toMatchObject({
      status: "available",
      version: "0.1.4",
    });
    expect(toastShown()).toBe(true);
  });

  it("asks first on a check the user starts with automatic checks off", async () => {
    env.preferences = { autoCheck: false, autoInstall: true };
    await runScheduledCheck();
    expect(sparkleCheckInformation).not.toHaveBeenCalled();
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
    await checkForUpdates({ userInitiated: true });
    expect(sparkleCheckInformation).toHaveBeenCalledOnce();
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
  });

  it("downloads an accepted update and restarts once Sparkle stages it", async () => {
    vi.useFakeTimers();
    env.preferences = { autoCheck: true, autoInstall: false };
    await checkForUpdates({ userInitiated: false });
    handleSparkleUpdateFound("0.1.4");
    handleSparkleCycleFinished(null);
    await downloadAvailableUpdate("restart");
    expect(sparkleDownloadInBackground).toHaveBeenCalledOnce();
    handleSparkleUpdateFound("0.1.4");
    expect(useUpdateStore.getState().status).toBe("downloading");
    expect(toastShown()).toBe(true);
    handleSparkleUpdateStaged("0.1.4");
    await vi.advanceTimersByTimeAsync(0);
    expect(sparkleInstallPendingUpdate).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().status).toBe("installing");
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();
  });

  it("stages an update accepted for quit without showing it again", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    await checkForUpdates({ userInitiated: false });
    handleSparkleUpdateFound("0.1.4");
    handleSparkleCycleFinished(null);
    await downloadAvailableUpdate("quit");
    expect(toastShown()).toBe(false);
    handleSparkleUpdateStaged("0.1.4");
    expect(useUpdateStore.getState().status).toBe("ready");
    expect(toastShown()).toBe(false);
    expect(sparkleInstallPendingUpdate).not.toHaveBeenCalled();
  });

  it("reports a failed download the user accepted", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    await checkForUpdates({ userInitiated: false });
    handleSparkleUpdateFound("0.1.4");
    handleSparkleCycleFinished(null);
    await downloadAvailableUpdate("quit");
    handleSparkleCycleFinished({ message: "signature" });
    expect(useUpdateStore.getState()).toMatchObject({
      status: "error",
      afterDownload: null,
    });
    expect(toast.error).toHaveBeenCalledWith("updater.failed", { duration: Infinity });
  });

  it("resumes at the next launch a download accepted before quitting", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    useUpdateStore.setState({ status: "available", version: "0.1.4" });
    await downloadAvailableUpdate("quit");
    resetStore();
    vi.clearAllMocks();
    await checkForUpdates({ userInitiated: false });
    handleSparkleUpdateFound("0.1.4");
    handleSparkleCycleFinished(null);
    await vi.waitFor(() => expect(sparkleDownloadInBackground).toHaveBeenCalledOnce());
    expect(toastShown()).toBe(false);
  });

  it("forgets an accepted update once that version runs", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    useUpdateStore.setState({ status: "available", version: "0.1.3" });
    await downloadAvailableUpdate("quit");
    resetStore();
    vi.clearAllMocks();
    await startUpdates();
    handleSparkleUpdateFound("0.1.3");
    handleSparkleCycleFinished(null);
    expect(useUpdateStore.getState().status).toBe("available");
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
  });

  it("reports a download Sparkle refuses to start", async () => {
    useUpdateStore.setState({ status: "available", version: "0.1.4" });
    vi.mocked(sparkleDownloadInBackground).mockResolvedValueOnce(false);
    await downloadAvailableUpdate("restart");
    expect(useUpdateStore.getState().status).toBe("error");
    expect(toast.error).toHaveBeenCalledWith("updater.failed", { duration: Infinity });
  });

  it("waits for the running session instead of starting another", async () => {
    vi.mocked(sparkleSessionInProgress).mockResolvedValueOnce(true);
    await checkForUpdates({ userInitiated: true });
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("checking");
  });

  it("offers an update Sparkle already staged", async () => {
    vi.mocked(sparklePendingVersion).mockResolvedValueOnce("0.1.4");
    await checkForUpdates({ userInitiated: true });
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "ready",
      version: "0.1.4",
    });
  });

  it("moves from downloading to ready as Sparkle reports progress", () => {
    handleSparkleUpdateFound("0.1.4");
    expect(useUpdateStore.getState()).toMatchObject({
      status: "downloading",
      version: "0.1.4",
    });
    handleSparkleUpdateStaged("0.1.4");
    expect(useUpdateStore.getState()).toMatchObject({
      status: "ready",
      version: "0.1.4",
    });
  });

  it("says up to date only when the user asked", async () => {
    await checkForUpdates({ userInitiated: false });
    handleSparkleCycleFinished(noUpdate);
    await Promise.resolve();
    expect(toast.success).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("idle");

    await checkForUpdates({ userInitiated: true });
    handleSparkleCycleFinished(noUpdate);
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("updater.upToDate"),
    );
  });

  it("reports a failed check only when the user asked", async () => {
    await checkForUpdates({ userInitiated: false });
    handleSparkleCycleFinished({ message: "offline" });
    expect(toast.error).not.toHaveBeenCalled();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "error",
      error: "offline",
    });

    await checkForUpdates({ userInitiated: true });
    handleSparkleCycleFinished({ message: "offline" });
    expect(toast.error).toHaveBeenCalledWith("updater.checkFailed");
  });

  it("reports a staged update that fails to install", () => {
    handleSparkleUpdateStaged("0.1.4");
    handleSparkleCycleFinished({ message: "installer failed" });
    expect(useUpdateStore.getState().status).toBe("error");
    expect(toast.error).toHaveBeenCalledWith("updater.failed", { duration: Infinity });
  });

  it("does not claim up to date when a cycle ends without an outcome", async () => {
    await checkForUpdates({ userInitiated: true });
    handleSparkleCycleFinished(parseCycleFinishedPayload({ updateCheck: "background" }));
    await Promise.resolve();
    expect(toast.success).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("idle");
  });

  it("installs through Sparkle and fails if the app is still running", async () => {
    vi.useFakeTimers();
    handleSparkleUpdateStaged("0.1.4");
    const install = installAndRelaunch();
    await vi.advanceTimersByTimeAsync(0);
    expect(sparkleInstallPendingUpdate).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().status).toBe("installing");
    await vi.advanceTimersByTimeAsync(30_000);
    await install;
    expect(useUpdateStore.getState().status).toBe("error");
    vi.useRealTimers();
  });

  it("routes the menu entry to install once an update is ready", async () => {
    handleSparkleUpdateStaged("0.1.4");
    expect(updateMenuItemState("ready")).toEqual({
      text: "updater.restartNow",
      enabled: true,
    });
    vi.mocked(sparkleInstallPendingUpdate).mockResolvedValueOnce(false);
    handleUpdateMenuAction();
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe("error"));
    expect(sparkleInstallPendingUpdate).toHaveBeenCalledOnce();
    expect(sparkleDownloadInBackground).not.toHaveBeenCalled();
  });

  it("brings a dismissed update back from the menu", () => {
    useUpdateStore.setState({ status: "available", version: "0.1.4" });
    dismissUpdate();
    expect(toastShown()).toBe(false);
    handleUpdateMenuAction();
    expect(toastShown()).toBe(true);
    expect(sparkleCheckInformation).not.toHaveBeenCalled();
  });
});

describe("updater on Windows and Linux", () => {
  beforeEach(() => {
    env.isMac = false;
    env.preferences = { autoCheck: true, autoInstall: true };
    resetStore();
    vi.clearAllMocks();
  });

  it("says up to date when the user asked and nothing was found", async () => {
    check.mockResolvedValueOnce(null);
    await checkForUpdates({ userInitiated: true });
    expect(useUpdateStore.getState().status).toBe("idle");
    expect(toast.success).toHaveBeenCalledWith("updater.upToDate");
  });

  it("downloads a found update and marks it ready", async () => {
    const download = vi.fn(() => Promise.resolve());
    check.mockResolvedValueOnce({ version: "0.1.4", download });
    await checkForUpdates({ userInitiated: true });
    expect(download).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "ready",
      version: "0.1.4",
      pendingUpdateVersion: "0.1.4",
    });
    expect(toastShown()).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("never installs a .deb when SocaDB closes", async () => {
    vi.mocked(getBundleType).mockResolvedValueOnce("deb" as never);
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: vi.fn(() => Promise.resolve()),
    });
    await startUpdates();
    expect(useUpdateStore.getState()).toMatchObject({
      canInstallOnQuit: false,
      status: "ready",
      pendingUpdateVersion: null,
    });
    expect(toastShown()).toBe(true);
  });

  it("asks before downloading, then installs at quit once accepted", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    const download = vi.fn(() => Promise.resolve());
    check.mockResolvedValueOnce({ version: "0.1.4", download });
    await checkForUpdates({ userInitiated: false });
    expect(download).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("available");
    expect(toastShown()).toBe(true);
    await downloadAvailableUpdate("quit");
    expect(download).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "ready",
      pendingUpdateVersion: "0.1.4",
    });
    expect(toastShown()).toBe(false);
  });

  it("resumes at the next launch a download accepted before quitting", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: () => neverSettles,
    });
    await checkForUpdates({ userInitiated: false });
    void downloadAvailableUpdate("quit");
    resetStore();
    const download = vi.fn(() => Promise.resolve());
    check.mockResolvedValueOnce({ version: "0.1.4", download });
    await checkForUpdates({ userInitiated: false });
    expect(download).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "ready",
      pendingUpdateVersion: "0.1.4",
    });
    expect(toastShown()).toBe(false);
  });

  it("drops a pending install when a new update object replaces it", async () => {
    useUpdateStore.setState({ status: "error", pendingUpdateVersion: "0.1.4" });
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: () => neverSettles,
    });
    void checkForUpdates({ userInitiated: false });
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe("downloading"));
    expect(useUpdateStore.getState().pendingUpdateVersion).toBeNull();
  });

  it("installs right after downloading when the user chose to restart", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    const install = vi.fn(() => Promise.resolve());
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: vi.fn(() => Promise.resolve()),
      install,
    });
    await checkForUpdates({ userInitiated: false });
    await downloadAvailableUpdate("restart");
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce());
    expect(stopAllAgents).toHaveBeenCalledOnce();
  });

  it("reports a download the user accepted that fails", async () => {
    env.preferences = { autoCheck: true, autoInstall: false };
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: vi.fn(() => Promise.reject(new Error("offline"))),
    });
    await checkForUpdates({ userInitiated: false });
    await downloadAvailableUpdate("restart");
    expect(useUpdateStore.getState().status).toBe("error");
    expect(toast.error).toHaveBeenCalledWith("updater.failed", { duration: Infinity });
  });

  it("ignores checks while an update is in flight", async () => {
    useUpdateStore.setState({ status: "downloading" });
    await checkForUpdates({ userInitiated: true });
    expect(check).not.toHaveBeenCalled();
  });

  it("installs only once the agents are stopped", async () => {
    let agentsStopped: ((value: undefined) => void) | undefined;
    vi.mocked(stopAllAgents).mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (agentsStopped = resolve)),
    );
    const install = vi.fn(() => Promise.resolve());
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: vi.fn(() => Promise.resolve()),
      install,
    });
    await checkForUpdates({ userInitiated: true });
    const installing = installAndRelaunch();
    await vi.waitFor(() => expect(stopAllAgents).toHaveBeenCalledOnce());
    expect(install).not.toHaveBeenCalled();
    agentsStopped?.(undefined);
    await installing;
    expect(install).toHaveBeenCalledOnce();
  });

  it.each([
    ["Windows, whose install() quits", true, ["mark", "install"]],
    ["Linux, back from install()", false, ["install", "mark"]],
  ])(
    "notes the relaunch at the right time on %s",
    async (_label, isWindows, expected) => {
      env.isWindows = isWindows;
      const { markRelaunch } = await import("./relaunchMark");
      const order: string[] = [];
      vi.mocked(markRelaunch).mockImplementationOnce(async () => {
        order.push("mark");
      });
      const install = vi.fn(async () => {
        order.push("install");
      });
      check.mockResolvedValueOnce({
        version: "0.1.4",
        download: vi.fn(() => Promise.resolve()),
        install,
      });
      await checkForUpdates({ userInitiated: true });
      await installAndRelaunch();
      expect(order).toEqual(expected);
      env.isWindows = false;
    },
  );

  it("clears the relaunch note when the install fails", async () => {
    env.isWindows = true;
    const { clearRelaunchMark } = await import("./relaunchMark");
    check.mockResolvedValueOnce({
      version: "0.1.4",
      download: vi.fn(() => Promise.resolve()),
      install: vi.fn(() => Promise.reject(new Error("blocked"))),
    });
    await checkForUpdates({ userInitiated: true });
    await installAndRelaunch();
    expect(clearRelaunchMark).toHaveBeenCalled();
    env.isWindows = false;
  });
});

describe("update menu entry", () => {
  it("keeps a literal ampersand in the label", async () => {
    const i18n = await import("../i18n");
    const t = vi.spyOn(i18n.default, "t").mockReturnValueOnce("Restart & install");
    expect(updateMenuItemState("ready").text).toBe("Restart && install");
    t.mockRestore();
  });

  it("is disabled while busy", () => {
    expect(updateMenuItemState("idle")).toEqual({
      text: "menu.checkForUpdates",
      enabled: true,
    });
    expect(updateMenuItemState("error").enabled).toBe(true);
    expect(updateMenuItemState("checking").enabled).toBe(false);
    expect(updateMenuItemState("downloading").enabled).toBe(false);
    expect(updateMenuItemState("installing").enabled).toBe(false);
  });
});

describe("update toast", () => {
  const base = { version: "0.1.4", dismissedVersion: null, afterDownload: null };

  it("shows an available or ready update until dismissed", () => {
    expect(updateToastShown({ ...base, status: "available" })).toBe(true);
    expect(updateToastShown({ ...base, status: "ready" })).toBe(true);
    expect(
      updateToastShown({ ...base, status: "ready", dismissedVersion: "0.1.4" }),
    ).toBe(false);
    expect(
      updateToastShown({ ...base, status: "available", dismissedVersion: "0.1.3" }),
    ).toBe(true);
  });

  it("shows a download only while the user waits to restart", () => {
    expect(updateToastShown({ ...base, status: "downloading" })).toBe(false);
    expect(
      updateToastShown({ ...base, status: "downloading", afterDownload: "quit" }),
    ).toBe(false);
    expect(
      updateToastShown({ ...base, status: "downloading", afterDownload: "restart" }),
    ).toBe(true);
    expect(updateToastShown({ ...base, status: "installing" })).toBe(true);
    expect(updateToastShown({ ...base, status: "checking" })).toBe(false);
  });
});
