import type { Column, ColumnType, DbType, SchemaEnum, Table } from "../types/schema";
import { LENGTH_TYPES, PRECISION_TYPES } from "../types/schema";

export type TypeGroupId = "numbers" | "text" | "dateTime" | "other" | "reuseEnum";

const TYPE_GROUPS: Record<DbType, { id: TypeGroupId; types: ColumnType[] }[]> = {
  postgresql: [
    {
      id: "numbers",
      types: [
        "integer",
        "bigint",
        "smallint",
        "serial",
        "bigserial",
        "numeric",
        "real",
        "double precision",
      ],
    },
    { id: "text", types: ["varchar", "char", "text"] },
    { id: "dateTime", types: ["date", "time", "timestamp", "timestamptz"] },
    { id: "other", types: ["boolean", "uuid", "enum", "json", "jsonb", "bytea"] },
  ],
  mysql: [
    {
      id: "numbers",
      types: [
        "int",
        "bigint",
        "tinyint",
        "smallint",
        "mediumint",
        "decimal",
        "float",
        "double",
      ],
    },
    { id: "text", types: ["varchar", "char", "text", "mediumtext", "longtext"] },
    { id: "dateTime", types: ["date", "time", "datetime", "timestamp"] },
    { id: "other", types: ["boolean", "enum", "json", "blob"] },
  ],
};

export const HINTED_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "serial",
  "bigserial",
  "numeric",
  "decimal",
  "real",
  "float",
  "double",
  "double precision",
  "text",
  "timestamptz",
  "jsonb",
  "bytea",
  "blob",
  "enum",
  "uuid",
]);

export const MYSQL_INT_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "int",
  "bigint",
  "tinyint",
  "smallint",
  "mediumint",
]);

export const TIME_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "date",
  "time",
  "datetime",
  "timestamp",
  "timestamptz",
]);

export interface TypeMenuItem {
  value: string;
  label: string;
  type?: ColumnType;
  enumValues?: string[];
}

export interface TypeMenuGroup {
  id: TypeGroupId;
  items: TypeMenuItem[];
}

export const reuseEnumValue = (enumId: string) => `enum:${enumId}`;

export function typeMenuGroups(
  dbType: DbType,
  query: string,
  enums: SchemaEnum[],
  currentEnumId: string | undefined,
): TypeMenuGroup[] {
  const q = query.trim().toLowerCase();
  const hit = (text: string) => !q || text.toLowerCase().includes(q);
  const groups: TypeMenuGroup[] = TYPE_GROUPS[dbType].map(({ id, types }) => ({
    id,
    items: types.filter(hit).map((type) => ({ value: type, label: type, type })),
  }));
  // MySQL writes enum values inline, so only PostgreSQL can share one.
  if (dbType === "postgresql") {
    groups.push({
      id: "reuseEnum",
      items: enums
        .filter((e) => e.id !== currentEnumId && (hit(e.name) || hit("enum")))
        .map((e) => ({
          value: reuseEnumValue(e.id),
          label: e.name,
          enumValues: e.values,
        })),
    });
  }
  return groups.filter((g) => g.items.length > 0);
}

export function typeLabel(column: Column): string {
  if (LENGTH_TYPES.has(column.type) && column.length) {
    return `${column.type}(${column.length})`;
  }
  if (PRECISION_TYPES.has(column.type) && column.precision) {
    const scale = column.scale !== undefined ? `,${column.scale}` : "";
    return `${column.type}(${column.precision}${scale})`;
  }
  return column.type;
}

export interface TimeSuggestion {
  value: string;
  hintKey: "insertDay" | "insertTime" | "insertMoment" | "sameAsNow";
}

export function timeSuggestions(type: ColumnType, dbType: DbType): TimeSuggestion[] {
  if (type === "date") return [{ value: "CURRENT_DATE", hintKey: "insertDay" }];
  if (type === "time") return [{ value: "CURRENT_TIME", hintKey: "insertTime" }];
  return dbType === "postgresql"
    ? [
        { value: "now()", hintKey: "insertMoment" },
        { value: "CURRENT_TIMESTAMP", hintKey: "sameAsNow" },
      ]
    : [{ value: "CURRENT_TIMESTAMP", hintKey: "insertMoment" }];
}

// The key icon already says a primary key is unique. A one-column unique index
// says the same as the UNIQUE flag.
export function isUniqueColumn(table: Table, column: Column): boolean {
  if (column.isPrimaryKey) return false;
  return (
    column.isUnique ||
    (table.indexes ?? []).some(
      (i) => i.unique && i.columnIds.length === 1 && i.columnIds[0] === column.id,
    )
  );
}
