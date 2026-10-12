import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));

import { getStartupPreference, initialView } from "./startupPreference";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});

describe("startup preference", () => {
  it("defaults to the home", () => {
    expect(getStartupPreference()).toBe("home");
    storage.set("socadb_startup", "nonsense");
    expect(getStartupPreference()).toBe("home");
    storage.set("socadb_startup", "lastSchema");
    expect(getStartupPreference()).toBe("lastSchema");
  });

  it("opens the editor only for a restored schema and the matching setting", () => {
    expect(initialView(true, "lastSchema")).toBe("editor");
    expect(initialView(true, "home")).toBe("home");
    expect(initialView(false, "lastSchema")).toBe("home");
  });
});
