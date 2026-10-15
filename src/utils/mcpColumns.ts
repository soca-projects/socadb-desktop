import type { z } from "zod";
import type { Column, ColumnType, DbType } from "../types/schema";
import { COLUMN_TYPES_BY_DB, MYSQL_NUMERIC_TYPES } from "../types/schema";
import { MYSQL_INT_TYPES } from "./columnTypes";
import { genId } from "./id";
import { enumValues, typeParams } from "./sqlColumns";
import { readType, resolveType } from "./sqlTypes";
import type { McpColumnInputZ, McpColumnUpdateZ } from "./zodSchemas";

type ColumnInput = z.output<typeof McpColumnInputZ>;
type ColumnUpdate = z.output<typeof McpColumnUpdateZ>;

export interface EnumSpec {
  values?: string[];
  name?: string;
}

interface TypeRead {
  type: ColumnType;
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  enumValues?: string[];
}

export const DB_LABEL: Record<DbType, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
};

// The agent writes types as it would in SQL: varchar(120), INT UNSIGNED,
// character varying. A type the database lacks is refused with the list of
// valid ones, so the agent corrects itself instead of getting varchar.
export function readMcpType(raw: string, dbType: DbType): TypeRead | string {
  const refused = `Type "${raw}" doesn't exist in ${DB_LABEL[dbType]}. Use one of: ${COLUMN_TYPES_BY_DB[dbType].join(", ")}.`;
  const read = readType(raw, dbType);
  if (!read || read.raw !== raw.trim() || read.array) return refused;
  // The agent quotes values either way, whatever the database.
  if (read.base === "enum")
    return {
      type: "enum",
      ...(read.args ? { enumValues: enumValues(read.args, "mysql") } : {}),
    };
  if (read.base === "tinyint" && read.args?.trim() === "1") return { type: "boolean" };
  const type = resolveType(read.base, dbType);
  if (!type) return refused;
  return {
    type,
    ...typeParams(type, read.args),
    ...(read.unsigned && MYSQL_NUMERIC_TYPES.has(type) ? { unsigned: true } : {}),
  };
}

function setDefined<K extends keyof Column>(
  target: Partial<Column>,
  key: K,
  value: Column[K] | undefined,
) {
  if (value !== undefined) target[key] = value;
}

function enumSpec(values: string[] | undefined, name: string | undefined): EnumSpec {
  return { ...(values ? { values } : {}), ...(name ? { name } : {}) };
}

function repeatedValue(values: string[] | undefined): string | null {
  const repeated = values?.find((v, i) => values.indexOf(v) !== i);
  return repeated === undefined
    ? null
    : `Enum values must be distinct: "${repeated}" appears twice`;
}

const autoIncrements = (type: ColumnType, dbType: DbType) =>
  dbType === "mysql" && MYSQL_INT_TYPES.has(type);

export function buildMcpColumn(
  input: ColumnInput,
  dbType: DbType,
): { column: Column; enumSpec?: EnumSpec } | string {
  const varchar: TypeRead = { type: "varchar" };
  const read = input.type === undefined ? varchar : readMcpType(input.type, dbType);
  if (typeof read === "string") return read;
  const isEnum =
    read.type === "enum" ||
    input.enumValues !== undefined ||
    (input.enumName !== undefined && dbType === "postgresql");
  const values = input.enumValues ?? read.enumValues;
  const repeated = repeatedValue(values);
  if (repeated) return repeated;
  const column: Column = {
    id: genId(),
    name: input.name,
    type: isEnum ? "enum" : read.type,
    isPrimaryKey: input.isPrimaryKey ?? false,
    isForeignKey: false,
    isNullable: input.isNullable ?? !input.isPrimaryKey,
    isUnique: input.isUnique ?? false,
    isAutoIncrement:
      (input.isAutoIncrement ?? false) &&
      autoIncrements(isEnum ? "enum" : read.type, dbType),
    defaultValue: input.defaultValue ?? null,
  };
  setDefined(column, "length", input.length ?? read.length);
  setDefined(column, "precision", input.precision ?? read.precision);
  setDefined(column, "scale", input.scale ?? read.scale);
  setDefined(column, "unsigned", input.unsigned ?? read.unsigned);
  if (column.defaultValue !== null) setDefined(column, "defaultKind", input.defaultKind);
  setDefined(column, "note", input.note || undefined);
  if (!isEnum) return { column };
  return {
    column,
    enumSpec: enumSpec(values, input.enumName),
  };
}

export function mcpColumnUpdates(
  updates: ColumnUpdate,
  column: Column,
  dbType: DbType,
): { updates: Partial<Column>; enumSpec?: EnumSpec } | string {
  const read = updates.type === undefined ? undefined : readMcpType(updates.type, dbType);
  if (typeof read === "string") return read;
  const changes: Partial<Column> = {};
  setDefined(changes, "name", updates.name);
  setDefined(changes, "isPrimaryKey", updates.isPrimaryKey);
  setDefined(
    changes,
    "isNullable",
    updates.isNullable ?? (updates.isPrimaryKey ? false : undefined),
  );
  setDefined(changes, "isUnique", updates.isUnique);
  setDefined(changes, "isAutoIncrement", updates.isAutoIncrement);
  setDefined(changes, "type", read?.type);
  setDefined(changes, "length", updates.length ?? read?.length);
  setDefined(changes, "precision", updates.precision ?? read?.precision);
  setDefined(changes, "scale", updates.scale ?? read?.scale);
  setDefined(changes, "unsigned", updates.unsigned ?? read?.unsigned);
  setDefined(changes, "defaultValue", updates.defaultValue);
  if (updates.note !== undefined) changes.note = updates.note || undefined;
  const defaultChanged =
    updates.defaultValue !== undefined && updates.defaultValue !== column.defaultValue;
  if (updates.defaultKind !== undefined) changes.defaultKind = updates.defaultKind;
  else if (defaultChanged) changes.defaultKind = undefined;
  if (changes.isAutoIncrement && !autoIncrements(changes.type ?? column.type, dbType))
    changes.isAutoIncrement = false;
  const values = updates.enumValues ?? read?.enumValues;
  const repeated = repeatedValue(values);
  if (repeated) return repeated;
  const toEnum =
    read?.type === "enum" ||
    values !== undefined ||
    (updates.enumName !== undefined && dbType === "postgresql");
  if (!toEnum) return { updates: changes };
  return { updates: changes, enumSpec: enumSpec(values, updates.enumName) };
}
