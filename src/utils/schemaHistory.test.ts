import { describe, it, expect, vi, beforeEach } from "vitest";

const files = vi.hoisted(() => new Map<string, string>());
const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  });
  return data;
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: { path: string }) =>
    command === "read_schema_file" ? files.get(args.path) : undefined,
  ),
}));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
vi.mock("../stores/themeStore", () => ({ useThemeStore: { getState: vi.fn() } }));

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import type { Table } from "../types/schema";
import { openRecentFile } from "./fileOperations";
import {
  dropPendingReplace,
  replaceOrAskFirst,
  replaceWithImport,
  runPendingReplace,
} from "./importApply";
import { handleOpenRecent } from "./menuActions";
import { handleUndo } from "./schemaActions";
import { hasUnsavedChanges } from "./schemaQueries";
import { restoreLastSession } from "./sessionPersistence";

const history = () => useSchemaStore.temporal.getState();

const table = (id: string): Table => ({
  id,
  name: id,
  position: { x: 0, y: 0 },
  columns: [],
});

function unsaved() {
  const { schema, filePath, savedAt } = useSchemaStore.getState();
  return hasUnsavedChanges(schema, filePath, savedAt);
}

beforeEach(() => {
  const { setSchema, setFilePath } = useSchemaStore.getState();
  setSchema(createEmptySchema());
  setFilePath(null);
  history().clear();
  storage.clear();
  vi.clearAllMocks();
});

describe("undo history across schemas", () => {
  it("never brings back the schema open before another one", async () => {
    files.set("/docs/shop.soca", JSON.stringify(createEmptySchema("shop", "postgresql")));
    files.set("/docs/blog.soca", JSON.stringify(createEmptySchema("blog", "postgresql")));
    await openRecentFile("/docs/shop.soca");
    useViewStore.getState().showHome();
    await openRecentFile("/docs/blog.soca");
    for (let i = 0; i < 5; i++) handleUndo();
    expect(useSchemaStore.getState().schema.name).toBe("blog");
    expect(useSchemaStore.getState().filePath).toBe("/docs/blog.soca");
  });

  it("leaves nothing to undo after the last session is restored", () => {
    storage.set(
      "socadb_last_session",
      JSON.stringify({
        schema: createEmptySchema("crm", "mysql"),
        filePath: "/docs/crm.soca",
      }),
    );
    expect(restoreLastSession()).toBe(true);
    expect(history().pastStates).toHaveLength(0);
  });

  it("leaves nothing to undo after an import replaces the schema and lays it out", async () => {
    useSchemaStore.getState().setSchema(createEmptySchema("before", "mysql"));
    await replaceWithImport(
      [table("users"), table("posts")],
      [],
      [],
      "postgresql",
      "imported",
    );
    const { tables } = useSchemaStore.getState().schema;
    expect(tables.some((t) => t.position.x !== 0 || t.position.y !== 0)).toBe(true);
    expect(history().pastStates).toHaveLength(0);
    expect(unsaved()).toBe(true);
  });

  it("keeps an edit made while the import is being laid out undoable", async () => {
    const importing = replaceWithImport(
      [table("users"), table("posts")],
      [],
      [],
      "postgresql",
      "imported",
    );
    useSchemaStore.getState().deleteTable("posts");
    await importing;
    while (history().pastStates.length > 0) handleUndo();
    expect(useSchemaStore.getState().schema.tables.map((t) => t.id)).toContain("posts");
  });

  it("keeps the history when the open file is picked again from recent files", async () => {
    files.set("/docs/shop.soca", JSON.stringify(createEmptySchema("shop", "postgresql")));
    await openRecentFile("/docs/shop.soca");
    useSchemaStore.getState().addTable(table("orders"));
    useSchemaStore.getState().markSaved();
    vi.mocked(invoke).mockClear();
    Object.assign(globalThis, { document: { activeElement: null }, HTMLElement: Object });
    try {
      handleOpenRecent("/docs/shop.soca");
    } finally {
      Reflect.deleteProperty(globalThis, "document");
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
    expect(invoke).not.toHaveBeenCalledWith("read_schema_file", expect.anything());
    expect(history().pastStates).toHaveLength(1);
  });
});

describe("replacing import", () => {
  it("replaces at once when nothing is unsaved", () => {
    const replace = vi.fn();
    replaceOrAskFirst(replace);
    expect(replace).toHaveBeenCalledOnce();
    expect(emit).not.toHaveBeenCalled();
  });

  it("asks about unsaved work first and replaces only once answered", () => {
    useSchemaStore.getState().addTable(table("draft"));
    useSchemaStore.setState({ savedAt: null });
    const replace = vi.fn();
    replaceOrAskFirst(replace);
    expect(replace).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("unsaved-guard-replace-import");
    runPendingReplace();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("drops the replacement when the prompt is cancelled", () => {
    useSchemaStore.getState().addTable(table("draft"));
    useSchemaStore.setState({ savedAt: null });
    const replace = vi.fn();
    replaceOrAskFirst(replace);
    dropPendingReplace();
    runPendingReplace();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("undo steps", () => {
  it("come only from changes to the schema", () => {
    const { setFilePath, markSaved } = useSchemaStore.getState();
    setFilePath("/docs/shop.soca");
    markSaved();
    expect(history().pastStates).toHaveLength(0);
  });
});
