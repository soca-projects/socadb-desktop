import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { invoke } from "@tauri-apps/api/core";
import { loadHomeEntries } from "./homeEntries";
import { createEmptySchema } from "../stores/schemaStore";

const mockInvoke = vi.mocked(invoke);
const files = new Map<string, { content: string; modifiedMs: number }>();
const locked = new Set<string>();

beforeEach(() => {
  files.clear();
  locked.clear();
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
    const { paths, path } = (args ?? {}) as { paths?: string[]; path?: string };
    if (cmd === "schema_files_info") {
      return (paths ?? []).map((p) => {
        const file = files.get(p);
        if (locked.has(p)) return { path: p, state: "unavailable", modifiedMs: null };
        return {
          path: p,
          state: file ? "present" : "missing",
          modifiedMs: file?.modifiedMs ?? null,
        };
      });
    }
    if (cmd === "read_schema_file") return files.get(path ?? "")?.content;
    throw new Error(`unexpected ${cmd}`);
  });
});

const opened = new Date(2026, 9, 10).toISOString();

describe("loadHomeEntries", () => {
  it("reads each schema once per modification time", async () => {
    files.set("/x/shop/a.soca", {
      content: JSON.stringify(createEmptySchema("a")),
      modifiedMs: 1,
    });
    const recents = [{ path: "/x/shop/a.soca", openedAt: opened }];
    const [first] = await loadHomeEntries(recents);
    expect(first).toMatchObject({
      name: "a",
      folder: "shop",
      state: "present",
      modifiedAt: 1,
    });
    expect(first.schema?.name).toBe("a");
    await loadHomeEntries(recents);
    expect(
      mockInvoke.mock.calls.filter(([cmd]) => cmd === "read_schema_file"),
    ).toHaveLength(1);
    files.set("/x/shop/a.soca", {
      content: JSON.stringify(createEmptySchema("b")),
      modifiedMs: 2,
    });
    const [changed] = await loadHomeEntries(recents);
    expect(changed.schema?.name).toBe("b");
  });

  it("marks missing files", async () => {
    const [missing] = await loadHomeEntries([{ path: "/x/gone.soca", openedAt: opened }]);
    expect(missing).toMatchObject({ state: "missing", schema: null, modifiedAt: null });
  });

  it("keeps unreadable files without a schema", async () => {
    files.set("/x/bad.soca", { content: "{nope", modifiedMs: 5 });
    const [bad] = await loadHomeEntries([{ path: "/x/bad.soca", openedAt: opened }]);
    expect(bad).toMatchObject({ state: "present", schema: null });
  });

  it("keeps files it may not read apart from missing ones", async () => {
    locked.add("/x/locked.soca");
    const [entry] = await loadHomeEntries([{ path: "/x/locked.soca", openedAt: opened }]);
    expect(entry).toMatchObject({ state: "unavailable", schema: null });
    expect(mockInvoke.mock.calls.some(([cmd]) => cmd === "read_schema_file")).toBe(false);
  });

  it("survives a corrupt opening date", async () => {
    const [entry] = await loadHomeEntries([
      { path: "/x/gone.soca", openedAt: "yesterday" },
    ]);
    expect(entry.openedAt).toBe(0);
  });

  it("skips the file system for an empty list", async () => {
    expect(await loadHomeEntries([])).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
