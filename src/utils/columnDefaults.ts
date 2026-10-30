import type { z } from "zod";
import type { Column, ColumnType, DbType, DefaultKind } from "../types/schema";
import { MYSQL_NUMERIC_TYPES } from "../types/schema";
import type { PrimaryKeyKindZ, PrimaryKeyPreferenceZ } from "./zodSchemas";
import { genId } from "./id";

export type PrimaryKeyKind = z.infer<typeof PrimaryKeyKindZ>;
export type PrimaryKeyPreference = z.infer<typeof PrimaryKeyPreferenceZ>;

export const DEFAULT_PRIMARY_KEYS: PrimaryKeyPreference = {
  postgresql: "uuid",
  mysql: "int",
};

export function createDefaultIdColumn(
  dbType: DbType,
  kind: PrimaryKeyKind = DEFAULT_PRIMARY_KEYS[dbType],
): Column {
  const column: Column = {
    id: genId(),
    name: "id",
    type: "uuid",
    isPrimaryKey: true,
    isForeignKey: false,
    isNullable: false,
    isUnique: true,
    isAutoIncrement: false,
    defaultValue: null,
  };
  if (kind === "uuid") {
    return dbType === "mysql"
      ? {
          ...column,
          type: "char",
          length: 36,
          defaultValue: "(UUID())",
          defaultKind: "expression",
        }
      : { ...column, defaultValue: "gen_random_uuid()" };
  }
  return {
    ...column,
    type: dbType === "mysql" ? kind : kind === "int" ? "serial" : "bigserial",
    isAutoIncrement: true,
  };
}

const ID_COLUMN_SQL: Record<DbType, Record<PrimaryKeyKind, string>> = {
  postgresql: {
    uuid: "id UUID NOT NULL DEFAULT gen_random_uuid()",
    int: "id SERIAL NOT NULL",
    bigint: "id BIGSERIAL NOT NULL",
  },
  mysql: {
    uuid: "id CHAR(36) NOT NULL DEFAULT (UUID())",
    int: "id INT NOT NULL AUTO_INCREMENT",
    bigint: "id BIGINT NOT NULL AUTO_INCREMENT",
  },
};

export function idColumnSql(dbType: DbType, kind: PrimaryKeyKind): string {
  return ID_COLUMN_SQL[dbType][kind];
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
  // An import can bring DEFAULT '', which the editor has no way to type.
  if (column.defaultValue === "" && column.defaultKind === "value") return "''";
  const value = column.defaultValue?.trim();
  if (!value) return null;
  if (defaultKindOf(column) === "expression") return value;
  if (NUMBER_TYPES.has(column.type) && /^-?\d+(\.\d+)?$/.test(value)) return value;
  if (column.type === "boolean" && /^(true|false)$/i.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}
