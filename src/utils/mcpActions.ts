import { useSchemaStore } from "../stores/schemaStore";
import { genId } from "./id";
import { computeAutoLayout } from "./autoLayout";
import { createTable } from "./schemaActions";
import {
  findTableByName,
  findColumnByName,
  serializeColumn,
  serializeRelation,
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
  McpColumnInputZ,
  ColumnTypeZ,
} from "./zodSchemas";
import type { z } from "zod";
import type { Column, Table, Schema } from "../types/schema";

type McpResult = { ok: true; data: unknown } | { ok: false; error: string };

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

const VALID_COLUMN_TYPES = new Set<string>(ColumnTypeZ.options);

function buildColumn(raw: z.output<typeof McpColumnInputZ>): Column {
  return {
    id: genId(),
    name: raw.name,
    type: VALID_COLUMN_TYPES.has(raw.type ?? "")
      ? (raw.type as Column["type"])
      : "varchar",
    isPrimaryKey: raw.isPrimaryKey ?? false,
    isForeignKey: false,
    isNullable: raw.isNullable ?? true,
    isUnique: raw.isUnique ?? false,
    isAutoIncrement: raw.isAutoIncrement ?? false,
    defaultValue: raw.defaultValue ?? null,
  };
}

type ActionHandler = (p: Record<string, unknown>) => McpResult | Promise<McpResult>;

const handlers: Record<string, ActionHandler> = {
  get_schema: () => {
    const { schema } = useSchemaStore.getState();
    return success({
      name: schema.name,
      dbType: schema.dbType,
      tables: schema.tables.map((t) => ({
        name: t.name,
        columns: t.columns.map(serializeColumn),
      })),
      relations: schema.relations.map((r) => serializeRelation(schema, r)),
    });
  },

  get_table: (p) => {
    const parsed = McpTableNameZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { schema } = useSchemaStore.getState();
    const table = findTableByName(schema, parsed.data.name);
    return success(
      table ? { name: table.name, columns: table.columns.map(serializeColumn) } : null,
    );
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
    const columns = parsed.data.columns?.map(buildColumn);
    createTable({ name: parsed.data.name, columns });
    return success(true);
  },

  update_table: (p) => {
    const parsed = McpUpdateTableZ.safeParse(p);
    if (!parsed.success) return fail(parsed.error.message);
    const { name, newName, color } = parsed.data;
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, name);
    if (!table) return success(false);
    const updates: Partial<{ name: string; color: string }> = {};
    if (newName) updates.name = newName;
    if (color) updates.color = color;
    if (Object.keys(updates).length === 0) return fail("Missing newName or color");
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
    store.addColumn(table.id, buildColumn(parsed.data.column));
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
    const { type: rawType, ...rest } = updates;
    const columnUpdates: Partial<Column> = { ...rest };
    if (rawType !== undefined) {
      columnUpdates.type = VALID_COLUMN_TYPES.has(rawType)
        ? (rawType as Column["type"])
        : "varchar";
    }
    store.updateColumn(table.id, col.id, columnUpdates);
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
      const positions = await computeAutoLayout(schema.tables, schema.relations);
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
  const handler = handlers[action];
  if (!handler) return fail(`Unknown action: ${action}`);
  return handler(payload);
}
