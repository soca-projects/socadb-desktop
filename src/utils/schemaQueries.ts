import type { Schema, Table, Column, Relation, SchemaEnum } from "../types/schema";
import { defaultKindOf } from "./columnDefaults";
import { derivedIndexName, indexColumnNames } from "./indexHelpers";

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

export function findEnumById(schema: Schema, id: string): SchemaEnum | undefined {
  return schema.enums?.find((e) => e.id === id);
}

export function getRelationsFromTable(schema: Schema, tableId: string): Relation[] {
  return schema.relations.filter((r) => r.from.tableId === tableId);
}

export function serializeColumn(schema: Schema, c: Column) {
  const enumType =
    c.type === "enum" && c.enumId ? findEnumById(schema, c.enumId) : undefined;
  return {
    name: c.name,
    type: c.type,
    ...(c.length !== undefined ? { length: c.length } : {}),
    ...(c.precision !== undefined ? { precision: c.precision } : {}),
    ...(c.scale !== undefined ? { scale: c.scale } : {}),
    ...(c.unsigned ? { unsigned: true } : {}),
    ...(enumType
      ? {
          enum:
            schema.dbType === "postgresql"
              ? { name: enumType.name, values: enumType.values }
              : { values: enumType.values },
        }
      : {}),
    isPrimaryKey: c.isPrimaryKey,
    isForeignKey: c.isForeignKey,
    isNullable: c.isNullable,
    isUnique: c.isUnique,
    isAutoIncrement: c.isAutoIncrement,
    defaultValue: c.defaultValue,
    ...(c.defaultValue !== null ? { defaultKind: defaultKindOf(c) } : {}),
    ...(c.note ? { note: c.note } : {}),
  };
}

export function serializeTable(schema: Schema, t: Table) {
  return {
    name: t.name,
    ...(t.note ? { note: t.note } : {}),
    columns: t.columns.map((c) => serializeColumn(schema, c)),
    ...(t.indexes?.length
      ? {
          indexes: t.indexes.map((i) => ({
            name: i.name ?? derivedIndexName(t, i),
            columns: indexColumnNames(t, i),
            unique: i.unique,
          })),
        }
      : {}),
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

export function isWorthResuming(schema: Schema, filePath: string | null): boolean {
  return filePath !== null || schema.tables.length > 0;
}
