import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn(), readTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));
vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(() => Promise.resolve()),
  warn: vi.fn(() => Promise.resolve()),
  info: vi.fn(() => Promise.resolve()),
  debug: vi.fn(() => Promise.resolve()),
}));

import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { readConfigForUpdate } from "./socadbDir";

const PATH = "/home/ana/.socadb/config.json";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readConfigForUpdate", () => {
  it("starts empty when there is no config yet", async () => {
    vi.mocked(exists).mockResolvedValue(false);
    expect(await readConfigForUpdate(PATH)).toEqual({});
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps every setting of a valid config", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue('{"theme":"dark","providers":{}}');
    expect(await readConfigForUpdate(PATH)).toEqual({ theme: "dark", providers: {} });
  });

  it("copies a config that doesn't parse aside before starting fresh", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockResolvedValue('{"theme": BROKEN');
    expect(await readConfigForUpdate(PATH)).toEqual({});
    expect(invoke).toHaveBeenCalledWith("atomic_write", {
      path: "/home/ana/.socadb/config.invalid.json",
      content: '{"theme": BROKEN',
    });
  });

  it("refuses to go on when the config can't be read", async () => {
    vi.mocked(exists).mockResolvedValue(true);
    vi.mocked(readTextFile).mockRejectedValue(new Error("Operation not permitted"));
    await expect(readConfigForUpdate(PATH)).rejects.toThrow("Operation not permitted");
    expect(invoke).not.toHaveBeenCalled();
  });
});
