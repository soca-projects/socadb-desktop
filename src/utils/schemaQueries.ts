import type { Schema, Table, Column, Relation } from "../types/schema";

export function findTableById(schema: Schema, id: string): Table | undefined {
  return schema.tables.find((t) => t.id === id);
}

export function findColumnById(table: Table, id: string): Column | undefined {
  return table.columns.find((c) => c.id === id);
}

export function findTableByName(schema: Schema, name: string): Table | undefined {
  return schema.tables.find((t) => t.name === name);
}

export function findColumnByName(table: Table, name: string): Column | undefined {
  return table.columns.find((c) => c.name === name);
}

export function getRelationsFromTable(schema: Schema, tableId: string): Relation[] {
  return schema.relations.filter((r) => r.from.tableId === tableId);
}

export function serializeColumn(c: Column) {
  return {
    name: c.name,
    type: c.type,
    isPrimaryKey: c.isPrimaryKey,
    isForeignKey: c.isForeignKey,
    isNullable: c.isNullable,
    isUnique: c.isUnique,
    isAutoIncrement: c.isAutoIncrement,
    defaultValue: c.defaultValue,
  };
}

export function serializeRelation(schema: Schema, r: Relation) {
  const fromTable = findTableById(schema, r.from.tableId);
  const toTable = findTableById(schema, r.to.tableId);
  const fromCol = fromTable ? findColumnById(fromTable, r.from.columnId) : undefined;
  const toCol = toTable ? findColumnById(toTable, r.to.columnId) : undefined;
  return {
    type: r.type,
    from: { table: fromTable?.name, column: fromCol?.name },
    to: { table: toTable?.name, column: toCol?.name },
  };
}
