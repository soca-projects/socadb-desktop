import type { ColumnType, DbType } from "../types/schema";
import { COLUMN_TYPES_BY_DB } from "../types/schema";
import { matchingParen, readName } from "./sqlScan";

const TYPE_ALIASES: Record<string, ColumnType> = {
  int: "int",
  integer: "integer",
  int4: "integer",
  int8: "bigint",
  int2: "smallint",
  bigint: "bigint",
  tinyint: "tinyint",
  smallint: "smallint",
  mediumint: "mediumint",
  float: "float",
  float4: "real",
  float8: "double precision",
  real: "real",
  double: "double",
  "double precision": "double precision",
  decimal: "decimal",
  numeric: "numeric",
  varchar: "varchar",
  "character varying": "varchar",
  "char varying": "varchar",
  char: "char",
  character: "char",
  bpchar: "char",
  text: "text",
  tinytext: "text",
  mediumtext: "mediumtext",
  longtext: "longtext",
  boolean: "boolean",
  bool: "boolean",
  date: "date",
  time: "time",
  "time with time zone": "time",
  timetz: "time",
  datetime: "datetime",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  "timestamp with time zone": "timestamptz",
  json: "json",
  jsonb: "jsonb",
  enum: "enum",
  blob: "blob",
  tinyblob: "blob",
  mediumblob: "blob",
  longblob: "blob",
  bytea: "bytea",
  uuid: "uuid",
  serial: "serial",
  serial4: "serial",
  smallserial: "serial",
  bigserial: "bigserial",
  serial8: "bigserial",
};

const SYNONYMS: Record<DbType, Partial<Record<ColumnType, ColumnType>>> = {
  mysql: {
    integer: "int",
    numeric: "decimal",
    real: "double",
    "double precision": "double",
    timestamptz: "timestamp",
    jsonb: "json",
    bytea: "blob",
    serial: "int",
    bigserial: "bigint",
  },
  postgresql: {
    int: "integer",
    decimal: "numeric",
    double: "double precision",
    float: "double precision",
    datetime: "timestamp",
    tinyint: "smallint",
    mediumint: "integer",
    mediumtext: "text",
    longtext: "text",
    blob: "bytea",
  },
};

const aliasOf = (name: string): ColumnType | undefined => {
  const key = name.toLowerCase();
  return Object.hasOwn(TYPE_ALIASES, key) ? TYPE_ALIASES[key] : undefined;
};

export const isTypeName = (name: string) => aliasOf(name) !== undefined;

export function dialectType(type: ColumnType, dbType: DbType): ColumnType | null {
  const named = SYNONYMS[dbType][type] ?? type;
  return COLUMN_TYPES_BY_DB[dbType].includes(named) ? named : null;
}

export function resolveType(base: string, dialect: DbType | null): ColumnType | null {
  const type = aliasOf(base);
  if (!type || !dialect) return type ?? null;
  return dialectType(type, dialect);
}

export interface ReadType {
  base: string;
  args: string | null;
  array: boolean;
  unsigned: boolean;
  raw: string;
  length: number;
}

export function readType(text: string, dialect: DbType | null): ReadType | null {
  const name = readName(text);
  if (!name) return null;
  let i = name.length;
  let base = name.last.toLowerCase();
  const word = /^\s+(precision|varying)\b/i.exec(text.slice(i));
  if (word && /^(?:double|character|char|bit)$/.test(base)) {
    base = `${base} ${word[1].toLowerCase()}`;
    i += word[0].length;
  }
  let args: string | null = null;
  const paren = /^\s*\(/.exec(text.slice(i));
  if (paren) {
    const open = i + paren[0].length - 1;
    const close = matchingParen(text, open, dialect);
    if (close > 0) {
      args = text.slice(open + 1, close);
      i = close + 1;
    }
  }
  const zone = /^\s+(with|without)\s+time\s+zone\b/i.exec(text.slice(i));
  if (zone) {
    if (zone[1].toLowerCase() === "with") base += " with time zone";
    i += zone[0].length;
  }
  const array = /^(?:\s*\[\s*\d*\s*\])+/.exec(text.slice(i));
  if (array) i += array[0].length;
  let unsigned = false;
  for (;;) {
    const flag = /^\s+(unsigned|signed|zerofill)\b/i.exec(text.slice(i));
    if (!flag) break;
    if (flag[1].toLowerCase() === "unsigned") unsigned = true;
    i += flag[0].length;
  }
  return {
    base,
    args,
    array: !!array,
    unsigned,
    raw: text.slice(0, i).trim(),
    length: i,
  };
}
