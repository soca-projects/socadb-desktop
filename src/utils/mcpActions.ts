import { UNDO_LIMIT, useSchemaStore } from "../stores/schemaStore";
import { genId } from "./id";
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
  serializeRelation,
  serializeTable,
} from "./schemaQueries";
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
} from "./zodSchemas";
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

type ActionHandler = (p: Record<string, unknown>) => McpResult | Promise<McpResult>;

const handlers: Record<string, ActionHandler> = {
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
    });
  },

  get_table: (p) => {
    const parsed = McpTableNameZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { schema } = useSchemaStore.getState();
    const table = findTableByName(schema, parsed.data.name);
    return success(table ? serializeTable(schema, table) : null);
  },

  get_editor_state: () => {
    const { schema, filePath } = useSchemaStore.getState();
    return success({
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
): Promise<McpResult> {
  // Dynamic import keeps the UI-driving actions out of release bundles.
  if (import.meta.env.DEV && action.startsWith("dev_")) {
    const { dispatchDevAction } = await import("./devBridge");
    return dispatchDevAction(action, payload);
  }
  const handler = handlers[action];
  if (!handler) return fail(`Unknown action: ${action}`);
  return asOneUndoStep(() => handler(payload));
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
    }
  }
}
