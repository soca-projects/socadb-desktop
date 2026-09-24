import { describe, it, expect, beforeEach, vi } from "vitest";

const env = vi.hoisted(() => {
  // updateStore exposes itself on window in dev builds.
  Object.assign(globalThis, { window: globalThis });
  return { isMac: true };
});

vi.mock("./platform", () => ({
  get IS_MAC() {
    return env.isMac;
  },
  IS_LINUX: false,
  IS_WINDOWS: false,
}));

vi.mock("../i18n", () => ({
  default: { t: (key: string) => key },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.1.3")),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

interface FakeUpdate {
  version: string;
  download: () => Promise<void>;
}

const check = vi.hoisted(() => vi.fn<() => Promise<FakeUpdate | null>>());

vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

vi.mock("./sparkle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sparkle")>()),
  sparklePendingVersion: vi.fn(() => Promise.resolve(null)),
  sparkleSessionInProgress: vi.fn(() => Promise.resolve(false)),
  sparkleCheckInBackground: vi.fn(() => Promise.resolve()),
  sparkleInstallPendingUpdate: vi.fn(() => Promise.resolve(true)),
}));

import { toast } from "sonner";
import { useUpdateStore } from "../stores/updateStore";
import {
  parseCycleFinishedPayload,
  sparkleCheckInBackground,
  sparkleInstallPendingUpdate,
  sparklePendingVersion,
  sparkleSessionInProgress,
} from "./sparkle";
import {
  checkForUpdates,
  handleSparkleCycleFinished,
  handleSparkleUpdateFound,
  handleSparkleUpdateStaged,
  handleUpdateMenuAction,
  installAndRelaunch,
  updateMenuItemState,
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
  });
}

describe("updater on macOS", () => {
  beforeEach(() => {
    env.isMac = true;
    resetStore();
    vi.clearAllMocks();
  });

  it("starts a background check when Sparkle is idle", async () => {
    await checkForUpdates({ userInitiated: false });
    expect(sparkleCheckInBackground).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().status).toBe("checking");
  });

  it("waits for the running session instead of starting another", async () => {
    vi.mocked(sparkleSessionInProgress).mockResolvedValueOnce(true);
    await checkForUpdates({ userInitiated: true });
    expect(sparkleCheckInBackground).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe("checking");
  });

  it("offers an update Sparkle already staged", async () => {
    vi.mocked(sparklePendingVersion).mockResolvedValueOnce("0.1.4");
    await checkForUpdates({ userInitiated: true });
    expect(sparkleCheckInBackground).not.toHaveBeenCalled();
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
    expect(sparkleCheckInBackground).not.toHaveBeenCalled();
  });
});

describe("updater on Windows and Linux", () => {
  beforeEach(() => {
    env.isMac = false;
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
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("ignores checks while an update is in flight", async () => {
    useUpdateStore.setState({ status: "downloading" });
    await checkForUpdates({ userInitiated: true });
    expect(check).not.toHaveBeenCalled();
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
