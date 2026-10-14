import type { Column, ColumnType, DbType, DefaultKind } from "../types/schema";
import { MYSQL_NUMERIC_TYPES } from "../types/schema";
import { genId } from "./id";

export function createDefaultIdColumn(dbType: DbType): Column {
  return dbType === "mysql"
    ? {
        id: genId(),
        name: "id",
        type: "int",
        isPrimaryKey: true,
        isForeignKey: false,
        isNullable: false,
        isUnique: true,
        isAutoIncrement: true,
        defaultValue: null,
      }
    : {
        id: genId(),
        name: "id",
        type: "uuid",
        isPrimaryKey: true,
        isForeignKey: false,
        isNullable: false,
        isUnique: true,
        isAutoIncrement: false,
        defaultValue: "gen_random_uuid()",
      };
}

const EXPRESSION_DEFAULT =
  /^(?:current_timestamp|current_date|current_time|localtimestamp|localtime|null|[a-z_][\w.]*\(.*\))$/is;

// Files saved before defaultKind existed hold either a bare value or an
// expression. A value someone already wrapped in quotes is written as is.
export function defaultKindOf(column: Column): DefaultKind {
  if (column.defaultKind) return column.defaultKind;
  const value = column.defaultValue?.trim() ?? "";
  return /^'.*'$/s.test(value) || EXPRESSION_DEFAULT.test(value) ? "expression" : "value";
}

const NUMBER_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  ...MYSQL_NUMERIC_TYPES,
  "integer",
  "numeric",
  "real",
  "double precision",
  "serial",
  "bigserial",
]);

// How the SQL export writes a default; also shown as a hint in the editor.
export function defaultSql(column: Column): string | null {
  const value = column.defaultValue?.trim();
  if (!value) return null;
  if (defaultKindOf(column) === "expression") return value;
  if (NUMBER_TYPES.has(column.type) && /^-?\d+(\.\d+)?$/.test(value)) return value;
  if (column.type === "boolean" && /^(true|false)$/i.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}
