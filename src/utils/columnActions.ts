import { useSchemaStore } from "../stores/schemaStore";
import { defaultKindOf } from "./columnDefaults";
import { MYSQL_INT_TYPES } from "./columnTypes";
import { findColumnById, findEnumById, findTableById } from "./schemaQueries";
import { ColumnTypeZ } from "./zodSchemas";
import type { Column, ColumnType } from "../types/schema";

const isColumnType = (value: string): value is ColumnType =>
  ColumnTypeZ.safeParse(value).success;

export function changeColumnType(tableId: string, columnId: string, value: string) {
  const store = useSchemaStore.getState();
  const table = findTableById(store.schema, tableId);
  const column = table && findColumnById(table, columnId);
  if (!column) return;

  if (value === "enum") {
    if (column.type === "enum") return;
    const current = column.defaultValue?.trim();
    const first = current && defaultKindOf(column) === "value" ? [current] : [];
    store.createEnumForColumn(tableId, columnId, first);
    return;
  }

  if (value.startsWith("enum:")) {
    const target = findEnumById(store.schema, value.slice(5));
    if (!target) return;
    const keep =
      column.defaultValue !== null && target.values.includes(column.defaultValue);
    store.updateColumn(tableId, columnId, {
      type: "enum",
      enumId: target.id,
      isAutoIncrement: false,
      defaultValue: keep ? column.defaultValue : null,
    });
    return;
  }

  if (!isColumnType(value)) return;
  const updates: Partial<Column> = { type: value };
  if (store.schema.dbType === "postgresql" || !MYSQL_INT_TYPES.has(value)) {
    updates.isAutoIncrement = false;
  }
  if (
    value === "boolean" &&
    column.defaultValue !== "true" &&
    column.defaultValue !== "false"
  ) {
    updates.defaultValue = null;
  }
  store.updateColumn(tableId, columnId, updates);
}
