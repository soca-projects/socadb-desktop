import { describe, it, expect, vi, beforeEach } from "vitest";

const { handleOpenRecent, handleShowHome, addRecentFile, logWarn, bridge } = vi.hoisted(
  () => ({
    handleOpenRecent: vi.fn(),
    handleShowHome: vi.fn(),
    addRecentFile: vi.fn(),
    logWarn: vi.fn(),
    bridge: {
      listener: undefined as ((event: { payload: unknown }) => void) | undefined,
      queued: [] as unknown,
    },
  }),
);

vi.mock("./menuActions", () => ({ handleOpenRecent, handleShowHome }));
vi.mock("./recentFiles", () => ({ addRecentFile }));
vi.mock("./log", () => ({ logWarn }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_name: string, fn: (event: { payload: unknown }) => void) => {
    bridge.listener = fn;
    return Promise.resolve(() => (bridge.listener = undefined));
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(bridge.queued)),
}));

import { openFromSystem, startOpenedFiles } from "./openedFiles";

let dialog: object | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  dialog = null;
  vi.stubGlobal("document", { querySelector: () => dialog });
  bridge.listener = undefined;
  bridge.queued = [];
});

describe("files opened from the system", () => {
  it("opens a single file like a recent one", () => {
    openFromSystem(["/a/shop.soca"]);
    expect(handleOpenRecent).toHaveBeenCalledWith("/a/shop.soca");
    expect(addRecentFile).not.toHaveBeenCalled();
  });

  it("adds several files to the home and shows it", () => {
    openFromSystem(["/a/shop.soca", "/a/blog.soca"]);
    expect(addRecentFile).toHaveBeenCalledTimes(2);
    expect(handleShowHome).toHaveBeenCalled();
    expect(handleOpenRecent).not.toHaveBeenCalled();
  });

  it("adds a single file to the recents instead of opening it under a dialog", () => {
    dialog = {};
    openFromSystem(["/a/shop.soca"]);
    expect(handleOpenRecent).not.toHaveBeenCalled();
    expect(addRecentFile).toHaveBeenCalledWith("/a/shop.soca");
  });

  it("adds several files to the recents without leaving a dialog", () => {
    dialog = {};
    openFromSystem(["/a/shop.soca", "/a/blog.soca"]);
    expect(addRecentFile).toHaveBeenCalledTimes(2);
    expect(handleShowHome).not.toHaveBeenCalled();
  });

  it("opens the files that waited for the window, then the later ones", async () => {
    bridge.queued = ["/a/shop.soca"];
    await startOpenedFiles();
    expect(handleOpenRecent).toHaveBeenCalledWith("/a/shop.soca");
    bridge.listener?.({ payload: ["/a/blog.soca"] });
    expect(handleOpenRecent).toHaveBeenLastCalledWith("/a/blog.soca");
  });

  it("ignores a payload of the wrong shape", async () => {
    bridge.queued = "/a/shop.soca";
    await startOpenedFiles();
    expect(handleOpenRecent).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith("file.opened.invalid", expect.anything());
  });
});
