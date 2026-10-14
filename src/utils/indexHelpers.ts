import type { Column, DbType, Table, TableIndex } from "../types/schema";
import { findColumnById } from "./schemaQueries";

export function indexColumnNames(
  table: Table,
  index: Pick<TableIndex, "columnIds">,
): string[] {
  return index.columnIds.flatMap((id) => findColumnById(table, id)?.name ?? []);
}

export function derivedIndexName(
  table: Table,
  index: Pick<TableIndex, "columnIds" | "unique">,
): string {
  return [
    table.name,
    ...indexColumnNames(table, index),
    index.unique ? "key" : "idx",
  ].join("_");
}

export function toggleIndexColumn(columnIds: string[], columnId: string): string[] {
  return columnIds.includes(columnId)
    ? columnIds.filter((id) => id !== columnId)
    : [...columnIds, columnId];
}

// PostgreSQL never indexes a foreign key by itself (MySQL does), and an index
// only serves lookups on its first column. The primary key's index starts with
// its first column and UNIQUE builds a one-column index.
export function unindexedForeignKeys(table: Table, dbType: DbType): Column[] {
  if (dbType !== "postgresql") return [];
  const firstKey = table.columns.find((c) => c.isPrimaryKey);
  const leading = new Set((table.indexes ?? []).map((i) => i.columnIds[0]));
  return table.columns.filter(
    (c) => c.isForeignKey && !c.isUnique && c !== firstKey && !leading.has(c.id),
  );
}

// The canvas keeps the hovered index's id, not a copy of its columns: an index
// removed or reordered under the pointer fires no mouseleave.
export function litColumnIds(
  indexes: TableIndex[],
  litId: string | null,
): string[] | null {
  if (!litId) return null;
  return indexes.find((i) => i.id === litId)?.columnIds ?? null;
}

// MySQL needs a prefix length to index TEXT and BLOB and cannot index JSON;
// PostgreSQL's json type has no default btree operator class.
const UNINDEXABLE: Record<DbType, ReadonlySet<string>> = {
  mysql: new Set(["text", "mediumtext", "longtext", "blob", "json"]),
  postgresql: new Set(["json"]),
};

export function isIndexable(type: string, dbType: DbType): boolean {
  return !UNINDEXABLE[dbType].has(type);
}
