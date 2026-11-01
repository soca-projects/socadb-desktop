import { getVersion } from "@tauri-apps/api/app";
import i18next from "../i18n";
import { UNDO_LIMIT, createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import { genId } from "./id";
import { noteSchemaChange } from "./fieldUndo";
import { computeAutoLayout } from "./autoLayout";
import { useViewStore } from "../stores/viewStore";
import { createTable } from "./schemaActions";
import { changeColumnType } from "./columnActions";
import {
  findColumnById,
  findColumnByName,
  findEnumById,
  findTableById,
  findTableByName,
  hasUnsavedChanges,
  isWorthResuming,
  serializeColumn,
  serializeRelation,
  serializeTable,
} from "./schemaQueries";
import { createDefaultIdColumn } from "./columnDefaults";
import { getPrimaryKeyPreference } from "./primaryKeyPreference";
import {
  McpCreateTableZ,
  McpUpdateTableZ,
  McpTableNameZ,
  McpAddColumnZ,
  McpUpdateColumnZ,
  McpDeleteColumnZ,
  McpCreateRelationZ,
  McpRelationEndpointsZ,
  McpAddIndexZ,
  McpDeleteIndexZ,
  McpNewSchemaZ,
  McpOpenSchemaZ,
  type McpClientZ,
} from "./zodSchemas";
import { fold } from "./conversationHistory";
import { openRecentFile } from "./fileOperations";
import { loadHomeEntries } from "./homeEntries";
import { splitSchemaPath } from "./homeList";
import { getRecentFiles } from "./recentFiles";
import type { z } from "zod";
import type { Column, Table, Schema } from "../types/schema";
import { DB_LABEL, buildMcpColumn, mcpColumnUpdates } from "./mcpColumns";
import type { EnumSpec } from "./mcpColumns";
import { derivedIndexName, isIndexable } from "./indexHelpers";
import { uniqueEnumName } from "./schemaIntegrity";

export type McpResult = { ok: true; data: unknown } | { ok: false; error: string };

function success(data: unknown): McpResult {
  return { ok: true, data };
}

function fail(error: string): McpResult {
  return { ok: false, error };
}

type RelationEndpoints =
  | { error: McpResult }
  | {
      fromTable: Table;
      toTable: Table;
      fromCol: Column;
      toCol: Column;
      schema: Schema;
    };

function resolveRelationEndpoints(
  data: z.output<typeof McpRelationEndpointsZ>,
): RelationEndpoints {
  const { schema } = useSchemaStore.getState();
  const fromTable = findTableByName(schema, data.fromTable);
  const toTable = findTableByName(schema, data.toTable);
  if (!fromTable || !toTable) return { error: success(false) };
  const fromCol = findColumnByName(fromTable, data.fromColumn);
  const toCol = findColumnByName(toTable, data.toColumn);
  if (!fromCol || !toCol) return { error: success(false) };
  return { fromTable, toTable, fromCol, toCol, schema };
}

function columnIn(tableId: string, columnId: string): Column | undefined {
  const table = findTableById(useSchemaStore.getState().schema, tableId);
  return table && findColumnById(table, columnId);
}

// The enum comes from normalizeSchema, which gives every enum column one.
function applyEnumSpec(tableId: string, columnId: string, spec: EnumSpec) {
  const store = useSchemaStore.getState();
  if (columnIn(tableId, columnId)?.type !== "enum")
    changeColumnType(tableId, columnId, "enum");
  const { schema } = useSchemaStore.getState();
  const named = schema.dbType === "postgresql" ? spec.name : undefined;
  const shared = named ? schema.enums?.find((e) => e.name === named) : undefined;
  if (shared && shared.id !== columnIn(tableId, columnId)?.enumId)
    changeColumnType(tableId, columnId, `enum:${shared.id}`);
  let enumId = columnIn(tableId, columnId)?.enumId;
  if (!enumId) return;
  // A new name on a column that shares its enum splits the column off rather
  // than renaming the other columns' type.
  const sharers = schema.tables
    .flatMap((t) => t.columns)
    .filter((c) => c.enumId === enumId);
  if (named && !shared && sharers.length > 1) {
    const values = findEnumById(schema, enumId)?.values ?? [];
    enumId = store.createEnumForColumn(tableId, columnId, spec.values ?? values);
  }
  if (spec.values) store.updateEnum(enumId, { values: spec.values });
  if (named && !shared) {
    const fresh = useSchemaStore.getState().schema;
    store.updateEnum(enumId, {
      name: uniqueEnumName(
        named,
        (fresh.enums ?? []).filter((e) => e.id !== enumId),
        fresh.tables.map((t) => t.name),
      ),
    });
  }
}

function enumNameError(
  spec: EnumSpec | undefined,
  schema: Schema,
  extraTable?: string,
): string | null {
  const name = schema.dbType === "postgresql" ? spec?.name : undefined;
  const tableNames = [
    ...schema.tables.map((t) => t.name),
    ...(extraTable ? [extraTable] : []),
  ];
  if (!name || !tableNames.some((t) => t.toLowerCase() === name.toLowerCase()))
    return null;
  return `"${name}" is a table's name: PostgreSQL gives each table a type of that name, so an enum can't take it`;
}

type McpClient = z.infer<typeof McpClientZ>;

type ActionHandler = (
  p: Record<string, unknown>,
  client: McpClient,
) => McpResult | Promise<McpResult>;

const LISTED_SCHEMAS = 50;

// The home screen shows no schema while the store still holds the last one:
// an AI app would change a schema the user can't see.
const ALLOWED_ON_HOME = new Set([
  "hello",
  "get_editor_state",
  "list_schemas",
  "new_schema",
  "open_schema",
]);

// A switch clears the undo history: kept as an undo step, ⌘Z would bring the
// previous schema back under the new one's name.
const SCHEMA_SWITCHES = new Set(["new_schema", "open_schema"]);

function parentPath(path: string): string {
  return path.replace(/[/\\]+[^/\\]*$/, "");
}

function folderKey(path: string): string {
  return fold(path.trim().replace(/\\/g, "/").replace(/\/+$/, ""));
}

function schemaKey(name: string): string {
  return fold(name.trim().replace(/\.soca$/i, ""));
}

function lastSchema(): { name: string; unsavedDraft: boolean } | null {
  const { schema, filePath } = useSchemaStore.getState();
  if (filePath) return { name: splitSchemaPath(filePath).name, unsavedDraft: false };
  return isWorthResuming(schema, null) ? { name: schema.name, unsavedDraft: true } : null;
}

function homeScreenError(): string {
  const last = lastSchema();
  const hint = last
    ? ` The last schema they had open is "${last.name}"${last.unsavedDraft ? ", an unsaved draft" : ""}.`
    : "";
  return `SocaDB shows its home screen, so no schema is open. If the user asked for a new database, call new_schema; if they named a schema, call open_schema; otherwise ask them which schema they mean.${hint}`;
}

function unsavedChangesError(): string | null {
  const { schema, filePath, savedAt } = useSchemaStore.getState();
  if (!hasUnsavedChanges(schema, filePath, savedAt)) return null;
  return filePath
    ? `"${splitSchemaPath(filePath).name}" has unsaved changes in SocaDB. Ask the user to save them, or to close the schema without saving, then try again.`
    : `The draft "${schema.name}" isn't saved yet. Ask the user to save it in SocaDB, or to close it without saving, then try again.`;
}

function showSchema() {
  useSchemaStore.temporal.getState().clear();
  useViewStore.getState().showEditor();
}

const handlers: Record<string, ActionHandler> = {
  hello: async () => success({ app: "socadb", version: await getVersion() }),

  list_schemas: async () => {
    const { schema, filePath } = useSchemaStore.getState();
    const shown = useViewStore.getState().view === "editor" ? filePath : null;
    const entries = await loadHomeEntries(getRecentFiles().slice(0, LISTED_SCHEMAS));
    const draft =
      filePath === null && isWorthResuming(schema, null)
        ? [{ name: schema.name, unsavedDraft: true, tables: schema.tables.length }]
        : [];
    return success([
      ...draft,
      ...entries
        .filter((e) => e.state === "present")
        .map((e) => ({
          name: e.name,
          folder: e.folder,
          lastOpened: new Date(e.openedAt).toISOString(),
          tables: e.schema?.tables.length ?? null,
          ...(e.path === shown ? { open: true } : {}),
        })),
    ]);
  },

  new_schema: (p) => {
    const parsed = McpNewSchemaZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const unsaved = unsavedChangesError();
    if (unsaved) return fail(unsaved);
    const name = parsed.data.name?.trim() || i18next.t("newSchema.untitled");
    const dbType = parsed.data.dbType ?? "postgresql";
    const store = useSchemaStore.getState();
    store.setSchema(createEmptySchema(name, dbType));
    store.setFilePath(null);
    showSchema();
    return success({ name, dbType });
  },

  open_schema: async (p) => {
    const parsed = McpOpenSchemaZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { name, folder } = parsed.data;
    const { schema, filePath } = useSchemaStore.getState();
    if (
      filePath === null &&
      folder === undefined &&
      isWorthResuming(schema, null) &&
      schemaKey(schema.name) === schemaKey(name)
    ) {
      useViewStore.getState().showEditor();
      return success({
        name: schema.name,
        unsavedDraft: true,
        tables: schema.tables.length,
      });
    }
    const named = getRecentFiles().filter(
      (r) => schemaKey(splitSchemaPath(r.path).name) === schemaKey(name),
    );
    const entries = await loadHomeEntries(named);
    const current = useSchemaStore.getState().filePath;
    const found = entries.filter((e) => e.state === "present" || e.path === current);
    if (found.length === 0) {
      return fail(`No schema named "${name}" in SocaDB's list; list_schemas shows them.`);
    }
    const folderList = (list: typeof found) =>
      list.map((e) => `"${parentPath(e.path)}"`).join(", ");
    const matches =
      folder === undefined
        ? found
        : found.filter(
            (e) =>
              fold(e.folder) === fold(folder.trim()) ||
              folderKey(parentPath(e.path)) === folderKey(folder),
          );
    if (matches.length === 0) {
      return fail(
        `No schema named "${name}" in the folder "${folder}". Schemas with that name are in ${folderList(found)}.`,
      );
    }
    if (matches.length > 1) {
      return fail(
        `Several schemas are named "${name}", in ${folderList(matches)}: call open_schema again with one of these folders.`,
      );
    }
    const path = matches[0].path;
    if (path === current) {
      useViewStore.getState().showEditor();
    } else {
      const unsaved = unsavedChangesError();
      if (unsaved) return fail(unsaved);
      await openRecentFile(path);
      if (useSchemaStore.getState().filePath !== path) {
        return fail(
          `SocaDB couldn't open "${name}": the file is missing or can't be read.`,
        );
      }
      showSchema();
    }
    const opened = useSchemaStore.getState().schema;
    return success({
      ...splitSchemaPath(path),
      dbType: opened.dbType,
      tables: opened.tables.length,
    });
  },

  get_schema: () => {
    const { schema } = useSchemaStore.getState();
    return success({
      name: schema.name,
      dbType: schema.dbType,
      tables: schema.tables.map((t) => serializeTable(schema, t)),
      relations: schema.relations.map((r) => serializeRelation(schema, r)),
      ...(schema.dbType === "postgresql" && schema.enums?.length
        ? { enums: schema.enums.map((e) => ({ name: e.name, values: e.values })) }
        : {}),
      primaryKeyForNewTables: serializeColumn(
        schema,
        createDefaultIdColumn(schema.dbType, getPrimaryKeyPreference()[schema.dbType]),
      ),
    });
  },

  get_table: (p) => {
    const parsed = McpTableNameZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { schema } = useSchemaStore.getState();
    const table = findTableByName(schema, parsed.data.name);
    return success(table ? serializeTable(schema, table) : null);
  },

  get_editor_state: (_p, client) => {
    const { schema, filePath } = useSchemaStore.getState();
    if (client === "external" && useViewStore.getState().view === "home") {
      return success({ screen: "home", lastSchema: lastSchema() });
    }
    return success({
      screen: "editor",
      filePath,
      schemaName: schema.name,
      dbType: schema.dbType,
      tableCount: schema.tables.length,
      relationCount: schema.relations.length,
    });
  },

  create_table: (p) => {
    const parsed = McpCreateTableZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { schema } = useSchemaStore.getState();
    if (findTableByName(schema, parsed.data.name)) {
      return fail(`Table "${parsed.data.name}" already exists`);
    }
    const built = (parsed.data.columns ?? []).map((c) =>
      buildMcpColumn(c, schema.dbType),
    );
    const refused = built.find((b) => typeof b === "string");
    if (typeof refused === "string") return fail(refused);
    const columns = built.flatMap((b) => (typeof b === "string" ? [] : [b]));
    const badName = columns
      .map((b) => enumNameError(b.enumSpec, schema, parsed.data.name))
      .find(Boolean);
    if (badName) return fail(badName);
    const keys = columns.filter((b) => b.column.isPrimaryKey);
    const keyInput = parsed.data.columns?.find((c) => c.isPrimaryKey);
    if (keys.length === 1 && keyInput?.isUnique === undefined)
      keys[0].column.isUnique = true;
    const tableId = createTable({
      name: parsed.data.name,
      columns: parsed.data.columns ? columns.map((b) => b.column) : undefined,
    });
    for (const { column, enumSpec } of columns) {
      if (enumSpec) applyEnumSpec(tableId, column.id, enumSpec);
    }
    if (parsed.data.note)
      useSchemaStore.getState().updateTable(tableId, { note: parsed.data.note });
    return success(true);
  },

  update_table: (p) => {
    const parsed = McpUpdateTableZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { name, newName, color, note } = parsed.data;
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, name);
    if (!table) return success(false);
    if (newName && newName !== name && findTableByName(store.schema, newName)) {
      return fail(`Table "${newName}" already exists`);
    }
    const updates: Partial<Pick<Table, "name" | "color" | "note">> = {};
    if (newName) updates.name = newName;
    if (color) updates.color = color;
    if (note !== undefined) updates.note = note || undefined;
    if (Object.keys(updates).length === 0) return fail("Missing newName, color or note");
    store.updateTable(table.id, updates);
    return success(true);
  },

  delete_table: (p) => {
    const parsed = McpTableNameZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, parsed.data.name);
    if (!table) return success(false);
    store.deleteTable(table.id);
    return success(true);
  },

  add_column: (p) => {
    const parsed = McpAddColumnZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, parsed.data.table);
    if (!table) return success(false);
    const built = buildMcpColumn(parsed.data.column, store.schema.dbType);
    if (typeof built === "string") return fail(built);
    const soleKey =
      built.column.isPrimaryKey && !table.columns.some((c) => c.isPrimaryKey);
    if (soleKey && parsed.data.column.isUnique === undefined)
      built.column.isUnique = true;
    const badName = enumNameError(built.enumSpec, store.schema);
    if (badName) return fail(badName);
    store.addColumn(table.id, built.column);
    if (built.enumSpec) applyEnumSpec(table.id, built.column.id, built.enumSpec);
    return success(true);
  },

  update_column: (p) => {
    const parsed = McpUpdateColumnZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { table: tableName, column: colName, updates } = parsed.data;
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, tableName);
    if (!table) return success(false);
    const col = findColumnByName(table, colName);
    if (!col) return success(false);
    const changes = mcpColumnUpdates(updates, col, store.schema.dbType);
    if (typeof changes === "string") return fail(changes);
    const badName = enumNameError(changes.enumSpec, store.schema);
    if (badName) return fail(badName);
    const { type, ...rest } = changes.updates;
    if (type !== undefined && type !== col.type && type !== "enum")
      changeColumnType(table.id, col.id, type);
    store.updateColumn(table.id, col.id, rest);
    if (changes.enumSpec) applyEnumSpec(table.id, col.id, changes.enumSpec);
    return success(true);
  },

  delete_column: (p) => {
    const parsed = McpDeleteColumnZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, parsed.data.table);
    if (!table) return success(false);
    const col = findColumnByName(table, parsed.data.column);
    if (!col) return success(false);
    store.deleteColumn(table.id, col.id);
    return success(true);
  },

  add_index: (p) => {
    const parsed = McpAddIndexZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const store = useSchemaStore.getState();
    const { dbType } = store.schema;
    const table = findTableByName(store.schema, parsed.data.table);
    if (!table) return success(false);
    const columns: Column[] = [];
    for (const name of parsed.data.columns) {
      const col = findColumnByName(table, name);
      if (!col) return fail(`Column "${name}" not found in "${table.name}"`);
      if (columns.includes(col)) return fail(`Column "${name}" is listed twice`);
      if (!isIndexable(col.type, dbType))
        return fail(`${col.name} is ${col.type}, which ${DB_LABEL[dbType]} can't index`);
      columns.push(col);
    }
    // One-column uniqueness is the column's UNIQUE flag, as in the editor.
    if (parsed.data.unique && columns.length === 1) {
      store.updateColumn(table.id, columns[0].id, { isUnique: true });
      return success("column");
    }
    const { name } = parsed.data;
    const taken = (table.indexes ?? []).some(
      (i) => (i.name ?? derivedIndexName(table, i)) === name,
    );
    if (name && taken) return fail(`Index "${name}" already exists on "${table.name}"`);
    const columnIds = columns.map((c) => c.id);
    const same = (table.indexes ?? []).find(
      (i) =>
        i.unique === (parsed.data.unique ?? false) &&
        i.columnIds.join() === columnIds.join(),
    );
    if (same)
      return fail(
        `The same index already exists: ${same.name ?? derivedIndexName(table, same)}`,
      );
    store.addIndex(table.id, {
      id: genId(),
      columnIds,
      unique: parsed.data.unique ?? false,
      ...(name ? { name } : {}),
    });
    return success("index");
  },

  delete_index: (p) => {
    const parsed = McpDeleteIndexZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, parsed.data.table);
    const index = table?.indexes?.find(
      (i) => (i.name ?? derivedIndexName(table, i)) === parsed.data.name,
    );
    if (!table || !index) return success(false);
    store.deleteIndex(table.id, index.id);
    return success(true);
  },

  create_relation: (p) => {
    const parsed = McpCreateRelationZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const endpoints = resolveRelationEndpoints(parsed.data);
    if ("error" in endpoints) return endpoints.error;
    const { fromTable, toTable, fromCol, toCol } = endpoints;
    useSchemaStore.getState().addRelation({
      id: genId(),
      from: { tableId: fromTable.id, columnId: fromCol.id },
      to: { tableId: toTable.id, columnId: toCol.id },
      type: parsed.data.type ?? "1:N",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    return success(true);
  },

  delete_relation: (p) => {
    const parsed = McpRelationEndpointsZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const endpoints = resolveRelationEndpoints(parsed.data);
    if ("error" in endpoints) return endpoints.error;
    const { fromTable, toTable, fromCol, toCol, schema } = endpoints;
    const relation = schema.relations.find(
      (r) =>
        r.from.tableId === fromTable.id &&
        r.from.columnId === fromCol.id &&
        r.to.tableId === toTable.id &&
        r.to.columnId === toCol.id,
    );
    if (!relation) return success(false);
    useSchemaStore.getState().deleteRelation(relation.id);
    return success(true);
  },

  auto_layout: async () => {
    const store = useSchemaStore.getState();
    const { schema } = store;
    try {
      const positions = await computeAutoLayout(
        schema.tables,
        schema.relations,
        useViewStore.getState().indexesOpen,
      );
      store.updateTablePositions(positions);
      return success(true);
    } catch {
      return fail("Auto-layout failed");
    }
  },
};

export async function dispatchMcpAction(
  action: string,
  payload: Record<string, unknown>,
  client: McpClient = "external",
): Promise<McpResult> {
  // Dynamic import keeps the UI-driving actions out of release bundles.
  if (import.meta.env.DEV && action.startsWith("dev_")) {
    const { dispatchDevAction } = await import("./devBridge");
    return dispatchDevAction(action, payload);
  }
  const handler = handlers[action];
  if (!handler) return fail(`Unknown action: ${action}`);
  if (
    client === "external" &&
    useViewStore.getState().view === "home" &&
    !ALLOWED_ON_HOME.has(action)
  ) {
    return fail(homeScreenError());
  }
  if (SCHEMA_SWITCHES.has(action)) return handler(payload, client);
  return asOneUndoStep(() => handler(payload, client));
}

// An agent call can patch the schema several times (a table, its enums, its
// note); undo takes it back in one step. Only the synchronous part is grouped:
// auto_layout awaits ELK, and other calls or the user's undo can run meanwhile.
// It writes once after its await, which is one step anyway.
function asOneUndoStep(
  run: () => McpResult | Promise<McpResult>,
): McpResult | Promise<McpResult> {
  const history = useSchemaStore.temporal;
  const before = useSchemaStore.getState().schema;
  history.getState().pause();
  try {
    return run();
  } finally {
    history.getState().resume();
    if (useSchemaStore.getState().schema !== before) {
      history.setState(({ pastStates }) => ({
        pastStates: [...pastStates, { schema: before }].slice(-UNDO_LIMIT),
        futureStates: [],
      }));
      // Pushed by hand, so the store's onSave never sees it.
      noteSchemaChange();
    }
  }
}
