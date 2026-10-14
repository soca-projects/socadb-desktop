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

// A default without a kind (older files, the agent, text just typed) holds
// either a bare value or an expression: a keyword like CURRENT_USER, a function
// call, a cast, or an expression in parentheses. USER stays a value, as 'user'
// is a common role, and so does text like (none). A value already in quotes is
// written as is.
const EXPRESSION_DEFAULTS = [
  /^(?:current_user|session_user|current_role|current_schema|current_catalog|null)$/i,
  /^(?:current_timestamp|current_date|current_time|localtimestamp|localtime)(?:\s*$|\s*[-+]|\s+on\s+update\s)/i,
  /^[a-z_][\w.]*\(/i,
  /^\(\s*(?:[a-z_][\w.]*\(|'|-?\d|null\b|true\b|false\b|current_|localtime).*\)$/is,
  /^(?:'.*'|.*\)|-?\d+(?:\.\d+)?|current_\w+)\s*::\s*[a-z_]/is,
];

export function defaultKindOf(column: Column): DefaultKind {
  if (column.defaultKind) return column.defaultKind;
  const value = column.defaultValue?.trim() ?? "";
  return /^'.*'$/s.test(value) || EXPRESSION_DEFAULTS.some((p) => p.test(value))
    ? "expression"
    : "value";
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

export function defaultSql(column: Column): string | null {
  const value = column.defaultValue?.trim();
  if (!value) return null;
  if (defaultKindOf(column) === "expression") return value;
  if (NUMBER_TYPES.has(column.type) && /^-?\d+(\.\d+)?$/.test(value)) return value;
  if (column.type === "boolean" && /^(true|false)$/i.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}
