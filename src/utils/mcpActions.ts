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
import type { Column, Table, Schema, RelationType } from "../types/schema";

type McpResult = { ok: true; data: unknown } | { ok: false; error: string };

function success(data: unknown): McpResult {
  return { ok: true, data };
}

function fail(error: string): McpResult {
  return { ok: false, error };
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
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

function resolveRelationEndpoints(p: Record<string, unknown>): RelationEndpoints {
  const fromTableName = getString(p, "fromTable");
  const toTableName = getString(p, "toTable");
  const fromColName = getString(p, "fromColumn");
  const toColName = getString(p, "toColumn");
  if (!fromTableName || !toTableName || !fromColName || !toColName)
    return {
      error: fail("Missing fromTable, toTable, fromColumn, or toColumn"),
    };
  const { schema } = useSchemaStore.getState();
  const fromTable = findTableByName(schema, fromTableName);
  const toTable = findTableByName(schema, toTableName);
  if (!fromTable || !toTable) return { error: success(false) };
  const fromCol = findColumnByName(fromTable, fromColName);
  const toCol = findColumnByName(toTable, toColName);
  if (!fromCol || !toCol) return { error: success(false) };
  return { fromTable, toTable, fromCol, toCol, schema };
}

function buildColumn(raw: Record<string, unknown>): Column {
  return {
    id: genId(),
    name: raw.name as string,
    type: (raw.type as Column["type"]) ?? "varchar",
    isPrimaryKey: (raw.isPrimaryKey as boolean) ?? false,
    isForeignKey: false,
    isNullable: (raw.isNullable as boolean) ?? true,
    isUnique: (raw.isUnique as boolean) ?? false,
    isAutoIncrement: (raw.isAutoIncrement as boolean) ?? false,
    defaultValue: (raw.defaultValue as string) ?? null,
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
    const name = getString(p, "name");
    if (!name) return fail("Missing name");
    const { schema } = useSchemaStore.getState();
    const table = findTableByName(schema, name);
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
    const name = getString(p, "name");
    if (!name) return fail("Missing name");
    const rawColumns = (Array.isArray(p.columns) ? p.columns : []) as Record<
      string,
      unknown
    >[];
    const columns = rawColumns.length > 0 ? rawColumns.map(buildColumn) : undefined;
    createTable({ name, columns });
    return success(true);
  },

  update_table: (p) => {
    const name = getString(p, "name");
    if (!name) return fail("Missing name");
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, name);
    if (!table) return success(false);
    const updates: Partial<{ name: string; color: string }> = {};
    const newName = getString(p, "newName");
    const color = getString(p, "color");
    if (newName) updates.name = newName;
    if (color) updates.color = color;
    if (Object.keys(updates).length === 0) return fail("Missing newName or color");
    store.updateTable(table.id, updates);
    return success(true);
  },

  delete_table: (p) => {
    const name = getString(p, "name");
    if (!name) return fail("Missing name");
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, name);
    if (!table) return success(false);
    store.deleteTable(table.id);
    return success(true);
  },

  add_column: (p) => {
    const tableName = getString(p, "table");
    if (!tableName || typeof p.column !== "object" || !p.column)
      return fail("Missing table or column");
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, tableName);
    if (!table) return success(false);
    store.addColumn(table.id, buildColumn(p.column as Record<string, unknown>));
    return success(true);
  },

  update_column: (p) => {
    const tableName = getString(p, "table");
    const colName = getString(p, "column");
    if (!tableName || !colName) return fail("Missing table or column");
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, tableName);
    if (!table) return success(false);
    const col = findColumnByName(table, colName);
    if (!col) return success(false);
    store.updateColumn(table.id, col.id, p.updates as Partial<Column>);
    return success(true);
  },

  delete_column: (p) => {
    const tableName = getString(p, "table");
    const colName = getString(p, "column");
    if (!tableName || !colName) return fail("Missing table or column");
    const store = useSchemaStore.getState();
    const table = findTableByName(store.schema, tableName);
    if (!table) return success(false);
    const col = findColumnByName(table, colName);
    if (!col) return success(false);
    store.deleteColumn(table.id, col.id);
    return success(true);
  },

  create_relation: (p) => {
    const endpoints = resolveRelationEndpoints(p);
    if ("error" in endpoints) return endpoints.error;
    const { fromTable, toTable, fromCol, toCol } = endpoints;
    useSchemaStore.getState().addRelation({
      id: genId(),
      from: { tableId: fromTable.id, columnId: fromCol.id },
      to: { tableId: toTable.id, columnId: toCol.id },
      type: (p.type as RelationType) ?? "1:N",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    return success(true);
  },

  delete_relation: (p) => {
    const endpoints = resolveRelationEndpoints(p);
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
