import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { restoreLastSession } from "./sessionPersistence";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  useSchemaStore.setState({ schema: createEmptySchema(), filePath: null, savedAt: null });
});

describe("restoreLastSession", () => {
  it("restores a saved schema", () => {
    const schema = createEmptySchema("shop");
    storage.set(
      "socadb_last_session",
      JSON.stringify({ schema, filePath: "/x/shop.soca", savedAt: schema.updatedAt }),
    );
    expect(restoreLastSession()).toBe(true);
    expect(useSchemaStore.getState().filePath).toBe("/x/shop.soca");
    expect(useSchemaStore.getState().schema.name).toBe("shop");
  });

  it("reports an empty untitled schema as nothing to resume", () => {
    storage.set(
      "socadb_last_session",
      JSON.stringify({ schema: createEmptySchema(), filePath: null, savedAt: null }),
    );
    expect(restoreLastSession()).toBe(false);
  });

  it("drops a corrupt session", () => {
    storage.set("socadb_last_session", "{not json");
    expect(restoreLastSession()).toBe(false);
    expect(storage.has("socadb_last_session")).toBe(false);
  });

  it("does nothing without a session", () => {
    expect(restoreLastSession()).toBe(false);
  });
});
