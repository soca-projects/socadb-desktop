import type {
  Column,
  ColumnType,
  DbType,
  ReferentialAction,
  SchemaEnum,
} from "../types/schema";
import { LENGTH_TYPES, MYSQL_NUMERIC_TYPES, PRECISION_TYPES } from "../types/schema";
import { genId } from "./id";
import { uniqueEnumName } from "./schemaIntegrity";
import { readDefault, readLiteral } from "./sqlDefaults";
import { NAME_PATTERN, readName, sameName, splitTopLevel, tokenize } from "./sqlScan";
import type { Name, Token } from "./sqlScan";
import { readType, resolveType } from "./sqlTypes";
import type { ReadType } from "./sqlTypes";

export type ImportIssue =
  | { kind: "typeGuessed"; table: string; column: string; type: string }
  | { kind: "checkSkipped"; table: string }
  | {
      kind: "indexSkipped";
      table: string;
      name: string;
      reason: "fulltext" | "spatial" | "expression";
    }
  | { kind: "indexCondition"; table: string; name: string }
  | { kind: "generatedColumn"; table: string; column: string };

export interface ParseCtx {
  dialect: DbType | null;
  enums: SchemaEnum[];
  // Enums made for a MySQL ENUM(…) column, dropped at the end if no column uses
  // them; an unused CREATE TYPE stays, as the user wrote it.
  inlineEnums: Set<string>;
  issues: ImportIssue[];
}

export function enumValues(args: string, dialect: DbType | null): string[] {
  const values = splitTopLevel(args, ",", dialect).map(
    (v) => readLiteral(v, dialect) ?? v,
  );
  // ENUM('') is how the export writes an enum that has no values yet.
  return values.length === 1 && values[0] === "" ? [] : values;
}

type ColumnTypeFields = Pick<
  Column,
  "type" | "length" | "precision" | "scale" | "enumId" | "unsigned"
>;

function columnTypeOf(
  read: ReadType,
  table: string,
  column: string,
  ctx: ParseCtx,
): ColumnTypeFields {
  const guessed = (): ColumnTypeFields => {
    ctx.issues.push({
      kind: "typeGuessed",
      table,
      column,
      type: read.raw.length > 40 ? `${read.raw.slice(0, 39)}…` : read.raw,
    });
    return { type: "varchar" };
  };
  if (read.array) return guessed();
  const named = ctx.enums.find((e) => sameName(e.name, read.base));
  if (named) return { type: "enum", enumId: named.id };
  if (read.base === "tinyint" && read.args?.trim() === "1") return { type: "boolean" };
  if (read.base === "enum") {
    const created: SchemaEnum = {
      id: genId(),
      name: uniqueEnumName(`${table}_${column}`, ctx.enums),
      values: enumValues(read.args ?? "", ctx.dialect),
    };
    ctx.enums.push(created);
    ctx.inlineEnums.add(created.id);
    return { type: "enum", enumId: created.id };
  }
  if (read.base === "serial" && ctx.dialect === "mysql")
    return { type: "bigint", unsigned: true };
  const type = resolveType(read.base, ctx.dialect);
  if (!type) return guessed();
  // PostgreSQL's varchar without a length has no limit, which is text.
  if (type === "varchar" && read.args === null && ctx.dialect === "postgresql")
    return { type: "text" };
  const fields: ColumnTypeFields = { type, ...typeParams(type, read.args) };
  if (read.unsigned && MYSQL_NUMERIC_TYPES.has(type)) fields.unsigned = true;
  return fields;
}

export function typeParams(
  type: ColumnType,
  args: string | null,
): Pick<Column, "length" | "precision" | "scale"> {
  const params = /^\s*(\d+)\s*(?:,\s*(\d+)\s*)?$/.exec(args ?? "");
  if (!params) return {};
  if (LENGTH_TYPES.has(type)) return { length: Number(params[1]) };
  if (!PRECISION_TYPES.has(type)) return {};
  return params[2] === undefined
    ? { precision: Number(params[1]) }
    : { precision: Number(params[1]), scale: Number(params[2]) };
}

const SERIAL_OF: Partial<Record<ColumnType, ColumnType>> = {
  integer: "serial",
  int: "serial",
  smallint: "serial",
  bigint: "bigserial",
};

export function makeSerial(col: Column) {
  col.type = SERIAL_OF[col.type] ?? col.type;
  col.isAutoIncrement = true;
  col.defaultValue = null;
  delete col.defaultKind;
}

export function applyDefault(col: Column, raw: string, ctx: ParseCtx) {
  if (
    ctx.dialect !== "mysql" &&
    /^nextval\s*\(/i.test(raw.trim()) &&
    SERIAL_OF[col.type]
  ) {
    makeSerial(col);
    return;
  }
  const read = readDefault(raw, ctx.dialect);
  col.defaultValue = read.value;
  if (read.kind) col.defaultKind = read.kind;
  else delete col.defaultKind;
}

const ACTION = String.raw`(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)`;
const REFERENCE = new RegExp(
  String.raw`^\s*REFERENCES\s+(${NAME_PATTERN})\s*(?:\(([^)]*)\))?((?:\s+(?:ON\s+(?:DELETE|UPDATE)\s+${ACTION}|MATCH\s+\w+|NOT\s+DEFERRABLE|DEFERRABLE|INITIALLY\s+\w+))*)`,
  "i",
);

function parseReferentialAction(value: string | undefined): ReferentialAction {
  const upper = (value ?? "").toUpperCase().replace(/\s+/g, " ");
  if (upper === "CASCADE") return "CASCADE";
  if (upper === "SET NULL") return "SET NULL";
  if (upper === "RESTRICT") return "RESTRICT";
  return "NO ACTION";
}

export interface Reference {
  table: Name;
  columns: string[];
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
  length: number;
}

export function readReference(text: string, ctx: ParseCtx): Reference | null {
  const match = REFERENCE.exec(text);
  const table = match && readName(match[1]);
  if (!match || !table) return null;
  const actions = match[3];
  return {
    table,
    columns: match[2] ? columnList(match[2], ctx).names : [],
    onDelete: parseReferentialAction(
      new RegExp(`ON\\s+DELETE\\s+${ACTION}`, "i").exec(actions)?.[1],
    ),
    onUpdate: parseReferentialAction(
      new RegExp(`ON\\s+UPDATE\\s+${ACTION}`, "i").exec(actions)?.[1],
    ),
    length: match[0].length,
  };
}

const COLUMN_STOPS = new Set([
  "NOT",
  "NULL",
  "AUTO_INCREMENT",
  "AUTOINCREMENT",
  "PRIMARY",
  "UNIQUE",
  "KEY",
  "REFERENCES",
  "CHECK",
  "COMMENT",
  "GENERATED",
  "COLLATE",
  "CONSTRAINT",
  "CHARACTER",
  "CHARSET",
  "SRID",
  "INVISIBLE",
  "VISIBLE",
  "STORAGE",
  "COLUMN_FORMAT",
]);

function skipParen(tokens: Token[], k: number): number {
  return tokens[k]?.text.startsWith("(") ? k + 1 : k;
}

export function parseColumn(
  def: string,
  tableName: string,
  ctx: ParseCtx,
): { column: Column; references: Reference | null } | null {
  const name = readName(def);
  if (!name || name.parts.length !== 1) return null;
  const afterName = def.slice(name.length);
  const read = readType(afterName, ctx.dialect);
  if (!read) return null;

  const column: Column = {
    id: genId(),
    name: name.last,
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
    ...columnTypeOf(read, tableName, name.last, ctx),
  };
  if (column.type === "serial" || column.type === "bigserial")
    column.isAutoIncrement = true;
  // MySQL's SERIAL is BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE.
  if (read.base === "serial" && ctx.dialect === "mysql")
    Object.assign(column, { isAutoIncrement: true, isNullable: false, isUnique: true });

  const rest = afterName.slice(read.length);
  const tokens = tokenize(rest, ctx.dialect);
  let references: Reference | null = null;
  let generated = false;
  let k = 0;
  while (k < tokens.length) {
    const t = tokens[k].upper;
    const next = tokens[k + 1]?.upper;
    if (t === "NOT" && next === "NULL") {
      column.isNullable = false;
      k += 2;
    } else if (t === "DEFAULT" && tokens[k + 1]) {
      // MySQL's ON UPDATE CURRENT_TIMESTAMP stays part of the default.
      let j = k + 2;
      while (j < tokens.length && !COLUMN_STOPS.has(tokens[j].upper)) j++;
      applyDefault(column, rest.slice(tokens[k + 1].start, tokens[j - 1].end), ctx);
      k = j;
    } else if (t === "AUTO_INCREMENT" || t === "AUTOINCREMENT") {
      column.isAutoIncrement = true;
      k++;
    } else if (t === "PRIMARY" || t === "UNIQUE") {
      if (t === "PRIMARY") column.isPrimaryKey = true;
      column.isUnique = true;
      k += next === "KEY" ? 2 : 1;
    } else if (t === "REFERENCES") {
      references = readReference(rest.slice(tokens[k].start), ctx);
      const end = tokens[k].start + (references?.length ?? tokens[k].text.length);
      while (k < tokens.length && tokens[k].start < end) k++;
    } else if (t === "CHECK") {
      ctx.issues.push({ kind: "checkSkipped", table: tableName });
      k = skipParen(tokens, k + 1);
    } else if (t === "COMMENT" && tokens[k + 1]) {
      const note = readLiteral(tokens[k + 1].text, ctx.dialect);
      if (note) column.note = note;
      k += 2;
    } else if (t === "GENERATED" || t === "AS") {
      if (tokens.slice(k, k + 6).some((x) => x.upper === "IDENTITY")) makeSerial(column);
      else generated = true;
      k++;
      while (k < tokens.length && !COLUMN_STOPS.has(tokens[k].upper)) k++;
    } else if (["COLLATE", "CHARSET", "CONSTRAINT", "SRID"].includes(t)) {
      k += 2;
    } else if (t === "CHARACTER" && next === "SET") {
      k += 3;
    } else if (t === "ON" && next === "UPDATE") {
      k += 3;
    } else {
      k++;
    }
  }
  if (generated)
    ctx.issues.push({ kind: "generatedColumn", table: tableName, column: name.last });
  if (column.isPrimaryKey) column.isNullable = false;
  return { column, references };
}

export function columnList(
  inner: string,
  ctx: ParseCtx,
): { names: string[]; expression: boolean } {
  const names: string[] = [];
  let expression = false;
  for (const item of splitTopLevel(inner, ",", ctx.dialect)) {
    const read = readName(item);
    const rest = read ? item.slice(read.length) : item;
    const plain =
      read?.parts.length === 1 &&
      /^\s*(?:\(\s*\d+\s*\))?(?:\s+(?:asc|desc|nulls\s+(?:first|last)|collate\s+\S+|(?:[a-z_]\w*\.)?[a-z_]\w*_ops))*\s*$/i.test(
        rest,
      );
    if (read && plain) names.push(read.last);
    else expression = true;
  }
  return { names, expression };
}
