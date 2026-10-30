import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));

import { getPrimaryKeyPreference } from "./primaryKeyPreference";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});

describe("primary key preference", () => {
  it("keeps UUID for PostgreSQL and an integer for MySQL until changed", () => {
    expect(getPrimaryKeyPreference()).toEqual({ postgresql: "uuid", mysql: "int" });
  });

  it("reads a stored choice and ignores a broken one", () => {
    storage.set(
      "socadb_primary_key",
      JSON.stringify({ postgresql: "bigint", mysql: "uuid" }),
    );
    expect(getPrimaryKeyPreference()).toEqual({ postgresql: "bigint", mysql: "uuid" });
    storage.set("socadb_primary_key", JSON.stringify({ postgresql: "serial" }));
    expect(getPrimaryKeyPreference()).toEqual({ postgresql: "uuid", mysql: "int" });
    storage.set("socadb_primary_key", "{not json");
    expect(getPrimaryKeyPreference()).toEqual({ postgresql: "uuid", mysql: "int" });
  });
});
