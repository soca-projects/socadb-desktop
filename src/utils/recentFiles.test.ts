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
});
