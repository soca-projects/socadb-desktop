import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(async () => "0.1.6") }));
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
vi.mock("./recentFiles", () => ({
  getRecentFiles: vi.fn(() => recents),
  addRecentFile: vi.fn(),
  removeRecentFile: vi.fn(),
  removeRecentFiles: vi.fn(),
  replaceRecentFile: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { dispatchMcpAction } from "./mcpActions";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import type { Schema } from "../types/schema";

let recents: { path: string; openedAt: string }[] = [];
const files = new Map<string, string>();

function schemaWithTables(name: string, tables: string[]): Schema {
  useSchemaStore.setState({
    schema: createEmptySchema(name),
    filePath: null,
    savedAt: null,
  });
  useViewStore.setState({ view: "editor" });
  for (const table of tables) void dispatchMcpAction("create_table", { name: table });
  return useSchemaStore.getState().schema;
}

function addFile(path: string, schema: Schema) {
  files.set(path, JSON.stringify(schema));
  recents.push({
    path,
    openedAt: new Date(Date.UTC(2026, 9, 27 - recents.length)).toISOString(),
  });
}

function onHomeAfter(path: string, schema: Schema, { unsaved = false } = {}) {
  useSchemaStore.setState({
    schema,
    filePath: path,
    savedAt: unsaved ? "an older save" : schema.updatedAt,
  });
  useSchemaStore.temporal.getState().clear();
  useViewStore.setState({ view: "home" });
}

beforeEach(() => {
  recents = [];
  files.clear();
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
    const { path, paths } = (args ?? {}) as { path?: string; paths?: string[] };
    if (cmd === "read_schema_file") {
      const content = files.get(path ?? "");
      if (content === undefined) throw new Error("not_found");
      return content;
    }
    if (cmd === "schema_files_info") {
      return (paths ?? []).map((p) => ({
        path: p,
        state: files.has(p) ? "present" : "missing",
        modifiedMs: files.has(p) ? 1 : null,
      }));
    }
    return undefined;
  });
});

describe("home screen", () => {
  it("refuses an AI app's schema tools and names the last schema", async () => {
    const boutique = schemaWithTables("boutique", ["orders"]);
    onHomeAfter("/work/boutique.soca", boutique);

    const result = await dispatchMcpAction("create_table", { name: "reviews" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("home screen");
    expect(result.error).toContain('"boutique"');
    expect(useSchemaStore.getState().schema.tables.map((t) => t.name)).toEqual([
      "orders",
    ]);
  });

  it("refuses reads too, so the agent can't mistake the hidden schema for an open one", async () => {
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", ["orders"]));
    expect((await dispatchMcpAction("get_schema", {})).ok).toBe(false);
  });

  it("lets SocaDB's own chat finish its turn on its schema", async () => {
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", ["orders"]));

    const result = await dispatchMcpAction("create_table", { name: "reviews" }, "chat");

    expect(result.ok).toBe(true);
    expect(useSchemaStore.getState().schema.tables.map((t) => t.name)).toEqual([
      "orders",
      "reviews",
    ]);
  });

  it("tells the agent it is on the home screen and which schema was last open", async () => {
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));
    expect(await dispatchMcpAction("get_editor_state", {})).toEqual({
      ok: true,
      data: { screen: "home", lastSchema: { name: "boutique", unsavedDraft: false } },
    });

    useSchemaStore.setState({
      schema: schemaWithTables("Brouillon", ["a"]),
      filePath: null,
    });
    useViewStore.setState({ view: "home" });
    expect(await dispatchMcpAction("get_editor_state", {})).toMatchObject({
      data: { lastSchema: { name: "Brouillon", unsavedDraft: true } },
    });

    useSchemaStore.setState({ schema: createEmptySchema("Untitled"), filePath: null });
    expect(await dispatchMcpAction("get_editor_state", {})).toMatchObject({
      data: { lastSchema: null },
    });
  });
});

describe("new_schema", () => {
  it("shows a new empty schema and drops the previous one's undo history", async () => {
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", ["orders"]));

    const result = await dispatchMcpAction("new_schema", {
      name: "Blog",
      dbType: "mysql",
    });

    expect(result).toEqual({ ok: true, data: { name: "Blog", dbType: "mysql" } });
    const state = useSchemaStore.getState();
    expect(state.schema.name).toBe("Blog");
    expect(state.schema.dbType).toBe("mysql");
    expect(state.schema.tables).toHaveLength(0);
    expect(state.filePath).toBeNull();
    expect(useViewStore.getState().view).toBe("editor");
    useSchemaStore.temporal.getState().undo();
    useSchemaStore.temporal.getState().undo();
    expect(useSchemaStore.getState().schema.name).toBe("Blog");
  });

  it("defaults to an untitled PostgreSQL schema", async () => {
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));
    const result = await dispatchMcpAction("new_schema", {});
    expect(result).toMatchObject({ ok: true, data: { dbType: "postgresql" } });
    expect(useSchemaStore.getState().schema.name).not.toBe("");
  });

  it("refuses while the open schema has unsaved changes", async () => {
    const boutique = schemaWithTables("boutique", ["orders"]);
    onHomeAfter("/work/boutique.soca", boutique, { unsaved: true });

    const result = await dispatchMcpAction("new_schema", { name: "Blog" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('"boutique" has unsaved changes');
    expect(useSchemaStore.getState().schema).toBe(boutique);
  });

  it("refuses over an unsaved draft", async () => {
    useSchemaStore.setState({
      schema: schemaWithTables("Brouillon", ["a"]),
      filePath: null,
    });
    useViewStore.setState({ view: "home" });
    const result = await dispatchMcpAction("new_schema", { name: "Blog" });
    expect(result).toMatchObject({ ok: false });
    expect(useSchemaStore.getState().schema.name).toBe("Brouillon");
  });
});

describe("open_schema", () => {
  it("opens a schema from the list by name, whatever its case and accents", async () => {
    addFile("/work/Café.soca", schemaWithTables("Café", ["orders", "items"]));
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));

    const result = await dispatchMcpAction("open_schema", { name: "cafe.soca" });

    expect(result).toEqual({
      ok: true,
      data: { name: "Café", folder: "work", dbType: "postgresql", tables: 2 },
    });
    expect(useSchemaStore.getState().filePath).toBe("/work/Café.soca");
    expect(useViewStore.getState().view).toBe("editor");
    expect(useSchemaStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("asks for the folder when several schemas share the name", async () => {
    addFile("/a/shop.soca", schemaWithTables("shop", ["a"]));
    addFile("/b/shop.soca", schemaWithTables("shop", ["b"]));
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));

    const ambiguous = await dispatchMcpAction("open_schema", { name: "shop" });
    expect(ambiguous).toMatchObject({ ok: false });
    if (!ambiguous.ok) expect(ambiguous.error).toContain('"/a", "/b"');

    expect(
      await dispatchMcpAction("open_schema", { name: "shop", folder: "b" }),
    ).toMatchObject({
      ok: true,
    });
    expect(useSchemaStore.getState().filePath).toBe("/b/shop.soca");
  });

  it("ignores a moved schema's old place, which list_schemas doesn't show", async () => {
    addFile("/new/schemas/blog.soca", schemaWithTables("blog", ["posts"]));
    addFile("/old/schemas/blog.soca", schemaWithTables("blog", []));
    files.delete("/old/schemas/blog.soca");
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));

    expect(await dispatchMcpAction("open_schema", { name: "blog" })).toMatchObject({
      ok: true,
      data: { tables: 1 },
    });
    expect(useSchemaStore.getState().filePath).toBe("/new/schemas/blog.soca");
  });

  it("takes the whole folder path when the folders share a name", async () => {
    addFile("/a/schemas/shop.soca", schemaWithTables("shop", ["a"]));
    addFile("/b/schemas/shop.soca", schemaWithTables("shop", ["b"]));
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));

    const byName = await dispatchMcpAction("open_schema", {
      name: "shop",
      folder: "schemas",
    });
    expect(byName).toMatchObject({ ok: false });
    if (!byName.ok) expect(byName.error).toContain('"/a/schemas", "/b/schemas"');

    expect(
      await dispatchMcpAction("open_schema", { name: "shop", folder: "/b/schemas/" }),
    ).toMatchObject({ ok: true });
    expect(useSchemaStore.getState().filePath).toBe("/b/schemas/shop.soca");
  });

  it("says where the schema is when the folder doesn't match", async () => {
    addFile("C:\\Users\\me\\shop.soca", schemaWithTables("shop", ["a"]));
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));

    const wrong = await dispatchMcpAction("open_schema", {
      name: "shop",
      folder: "other",
    });
    expect(wrong).toMatchObject({ ok: false });
    if (!wrong.ok) expect(wrong.error).toContain('in "C:\\Users\\me"');

    expect(
      await dispatchMcpAction("open_schema", { name: "shop", folder: "C:/Users/me" }),
    ).toMatchObject({ ok: true });
  });

  it("fails on a name that isn't in the list", async () => {
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));
    expect(await dispatchMcpAction("open_schema", { name: "nope" })).toMatchObject({
      ok: false,
    });
    expect(useViewStore.getState().view).toBe("home");
  });

  it("refuses to leave a schema with unsaved changes, but shows that schema itself", async () => {
    const boutique = schemaWithTables("boutique", ["orders"]);
    addFile("/work/boutique.soca", boutique);
    addFile("/work/blog.soca", schemaWithTables("blog", []));
    onHomeAfter("/work/boutique.soca", boutique, { unsaved: true });

    expect(await dispatchMcpAction("open_schema", { name: "blog" })).toMatchObject({
      ok: false,
    });
    expect(useSchemaStore.getState().filePath).toBe("/work/boutique.soca");

    expect(await dispatchMcpAction("open_schema", { name: "boutique" })).toMatchObject({
      ok: true,
    });
    expect(useSchemaStore.getState().schema).toBe(boutique);
    expect(useViewStore.getState().view).toBe("editor");
  });

  it("resumes the unsaved draft by its name", async () => {
    const draft = schemaWithTables("Brouillon", ["a"]);
    useViewStore.setState({ view: "home" });

    expect(await dispatchMcpAction("open_schema", { name: "brouillon" })).toMatchObject({
      ok: true,
      data: { unsavedDraft: true },
    });
    expect(useSchemaStore.getState().schema).toBe(draft);
    expect(useViewStore.getState().view).toBe("editor");
  });

  it("fails when the file is gone", async () => {
    addFile("/work/blog.soca", schemaWithTables("blog", []));
    files.delete("/work/blog.soca");
    onHomeAfter("/work/boutique.soca", schemaWithTables("boutique", []));

    expect(await dispatchMcpAction("open_schema", { name: "blog" })).toMatchObject({
      ok: false,
    });
    expect(useSchemaStore.getState().filePath).toBe("/work/boutique.soca");
  });
});

describe("list_schemas", () => {
  it("marks a schema open only while the editor shows it", async () => {
    const boutique = schemaWithTables("boutique", ["orders"]);
    addFile("/work/boutique.soca", boutique);
    onHomeAfter("/work/boutique.soca", boutique);
    const onHome = await dispatchMcpAction("list_schemas", {});
    expect(onHome.ok && onHome.data).toEqual([
      expect.not.objectContaining({ open: true }),
    ]);

    useViewStore.setState({ view: "editor" });
    expect(await dispatchMcpAction("list_schemas", {})).toMatchObject({
      data: [{ name: "boutique", open: true }],
    });
  });

  it("lists the unsaved draft first, then the schemas that still exist", async () => {
    addFile("/work/boutique.soca", schemaWithTables("boutique", ["orders"]));
    addFile("/old/gone.soca", schemaWithTables("gone", []));
    files.delete("/old/gone.soca");
    useSchemaStore.setState({
      schema: schemaWithTables("Brouillon", ["a", "b"]),
      filePath: null,
    });
    useViewStore.setState({ view: "home" });

    const result = await dispatchMcpAction("list_schemas", {});

    expect(result).toEqual({
      ok: true,
      data: [
        { name: "Brouillon", unsavedDraft: true, tables: 2 },
        {
          name: "boutique",
          folder: "work",
          lastOpened: recents[0].openedAt,
          tables: 1,
        },
      ],
    });
  });
});

describe("hello", () => {
  it("answers as SocaDB with the app version", async () => {
    expect(await dispatchMcpAction("hello", {})).toEqual({
      ok: true,
      data: { app: "socadb", version: "0.1.6" },
    });
  });
});
