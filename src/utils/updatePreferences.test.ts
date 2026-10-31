import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));

import { asksBeforeDownloading, getUpdatePreferences } from "./updatePreferences";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});

describe("update preferences", () => {
  it("checks and installs automatically until changed", () => {
    expect(getUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: true });
  });

  it("reads a stored choice and ignores a broken one", () => {
    storage.set(
      "socadb_updates",
      JSON.stringify({ autoCheck: true, autoInstall: false }),
    );
    expect(getUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: false });
    storage.set("socadb_updates", JSON.stringify({ autoCheck: "yes" }));
    expect(getUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: true });
    storage.set("socadb_updates", "{not json");
    expect(getUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: true });
  });

  it("downloads on its own only when both settings are on", () => {
    expect(asksBeforeDownloading({ autoCheck: true, autoInstall: true })).toBe(false);
    expect(asksBeforeDownloading({ autoCheck: true, autoInstall: false })).toBe(true);
    expect(asksBeforeDownloading({ autoCheck: false, autoInstall: true })).toBe(true);
    expect(asksBeforeDownloading({ autoCheck: false, autoInstall: false })).toBe(true);
  });
});
