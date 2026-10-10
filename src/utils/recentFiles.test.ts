import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(() => Promise.resolve("/mock/home/")),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
}));

import {
  addRecentFile,
  getRecentFiles,
  clearRecentFiles,
  removeRecentFile,
  removeRecentFiles,
  replaceRecentFile,
  subscribeRecentFiles,
  MAX_RECENT,
} from "./recentFiles";

describe("recentFiles", () => {
  beforeEach(() => {
    clearRecentFiles();
    vi.clearAllMocks();
  });

  it("adds a file to the list", () => {
    addRecentFile("/path/to/schema.soca");
    const files = getRecentFiles();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("/path/to/schema.soca");
  });

  it("moves duplicate to top instead of adding", () => {
    addRecentFile("/path/a.soca");
    addRecentFile("/path/b.soca");
    addRecentFile("/path/a.soca");
    const files = getRecentFiles();
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("/path/a.soca");
  });

  it("limits to MAX_RECENT entries", () => {
    for (let i = 0; i < MAX_RECENT + 5; i++) {
      addRecentFile(`/path/file-${i}.soca`);
    }
    expect(getRecentFiles()).toHaveLength(MAX_RECENT);
  });

  it("clearRecentFiles empties the list", () => {
    addRecentFile("/path/a.soca");
    clearRecentFiles();
    expect(getRecentFiles()).toHaveLength(0);
  });

  it("removeRecentFile removes a specific entry", () => {
    addRecentFile("/path/a.soca");
    addRecentFile("/path/b.soca");
    removeRecentFile("/path/a.soca");
    const files = getRecentFiles();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("/path/b.soca");
  });
  it("keeps a thousand schemas", () => {
    expect(MAX_RECENT).toBe(1000);
  });

  it("replaceRecentFile keeps the entry's place and date", () => {
    addRecentFile("/p/a.soca");
    addRecentFile("/p/b.soca");
    const before = getRecentFiles()[1];
    replaceRecentFile("/p/a.soca", "/p/moved/a.soca");
    const files = getRecentFiles();
    expect(files.map((f) => f.path)).toEqual(["/p/b.soca", "/p/moved/a.soca"]);
    expect(files[1].openedAt).toBe(before.openedAt);
  });

  it("replaceRecentFile drops an older entry of the new path", () => {
    addRecentFile("/p/new.soca");
    addRecentFile("/p/old.soca");
    replaceRecentFile("/p/old.soca", "/p/new.soca");
    expect(getRecentFiles().map((f) => f.path)).toEqual(["/p/new.soca"]);
  });

  it("removeRecentFiles removes several entries", () => {
    addRecentFile("/p/a.soca");
    addRecentFile("/p/b.soca");
    addRecentFile("/p/c.soca");
    removeRecentFiles(["/p/a.soca", "/p/c.soca"]);
    expect(getRecentFiles().map((f) => f.path)).toEqual(["/p/b.soca"]);
  });

  it("notifies subscribers with a new array", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRecentFiles(listener);
    const before = getRecentFiles();
    addRecentFile("/p/a.soca");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getRecentFiles()).not.toBe(before);
    unsubscribe();
    addRecentFile("/p/b.soca");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns the same array while nothing changes", () => {
    addRecentFile("/p/a.soca");
    expect(getRecentFiles()).toBe(getRecentFiles());
  });
});
