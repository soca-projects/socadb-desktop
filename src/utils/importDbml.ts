import type {
  Column,
  DbType,
  ReferentialAction,
  Relation,
  SchemaEnum,
  Table,
} from "../types/schema";
import i18next from "../i18n";
import { parseDbml } from "./dbmlParser";
import type {
  DbmlColumn,
  DbmlEndpoint,
  DbmlFile,
  DbmlIndex,
  DbmlOp,
  DbmlSettings,
  DbmlTable,
  DbmlValue,
} from "./dbmlParser";
import { DbmlSyntaxError } from "./dbmlScan";
import { genId } from "./id";
import type { SqlImportResult } from "./importSql";
import { linkEnumColumns } from "./schemaIntegrity";
import { applyDefault, columnOfType, makeSerial } from "./sqlColumns";
import type { ImportIssue } from "./sqlColumns";
import { renameDuplicates } from "./sqlParser";
import { sameName } from "./sqlScan";
import {
  applyKeyDef,
  draftCtx,
  findColumn,
  finishIndexes,
  newCtx,
  pick,
} from "./sqlTables";
import type { Ctx, TableDraft } from "./sqlTables";
import { readType } from "./sqlTypes";
import type { ReadType } from "./sqlTypes";

interface Entry {
  draft: TableDraft;
  alias: string | null;
}

type RefSide = { entry: Entry; columns: string[] } | DbmlEndpoint;

interface PendingRef {
  from: RefSide;
  op: DbmlOp;
  to: RefSide;
  settings: DbmlSettings;
  inline: boolean;
}

function dialectOf(databaseType: string | null): DbType | null {
  if (!databaseType) return null;
  if (/postgres/i.test(databaseType)) return "postgresql";
  if (/mysql|mariadb/i.test(databaseType)) return "mysql";
  return null;
}

const MYSQL_TYPES = new Set([
  "tinyint",
  "mediumint",
  "tinytext",
  "mediumtext",
  "longtext",
  "tinyblob",
  "mediumblob",
  "longblob",
  "year",
]);

const POSTGRESQL_TYPES = new Set([
  "bigserial",
  "smallserial",
  "serial4",
  "serial8",
  "int2",
  "int4",
  "int8",
  "float4",
  "float8",
  "timestamptz",
  "timetz",
  "timestamp with time zone",
  "time with time zone",
  "jsonb",
  "bytea",
  "double precision",
  "character varying",
  "interval",
  "inet",
  "cidr",
  "macaddr",
]);

const OTHER_DATABASE_TYPES = new Set([
  "nvarchar",
  "nchar",
  "ntext",
  "datetime2",
  "datetimeoffset",
  "smalldatetime",
  "uniqueidentifier",
  "varchar2",
  "nvarchar2",
  "number",
  "clob",
  "nclob",
  "money",
  "smallmoney",
  "bit",
  "image",
  "rowversion",
]);

function dialectFromTypes(file: DbmlFile): DbType | null {
  const enums = new Set(file.enums.map((e) => e.name.toLowerCase()));
  let mysql = 0;
  let postgresql = 0;
  for (const table of [...file.tables, ...file.partials]) {
    for (const item of table.items) {
      if (item.kind !== "column") continue;
      const text = /^"([^"]*)"$/.exec(item.column.type)?.[1] ?? item.column.type;
      const read = readType(text, null);
      if (!read || enums.has(read.base)) continue;
      if (OTHER_DATABASE_TYPES.has(read.base)) return null;
      if (read.unsigned || MYSQL_TYPES.has(read.base)) mysql++;
      if (read.array || POSTGRESQL_TYPES.has(read.base)) postgresql++;
    }
  }
  if (mysql > postgresql) return "mysql";
  if (postgresql > mysql) return "postgresql";
  return null;
}

function readColumnType(text: string, ctx: Ctx): ReadType {
  const quoted = /^"([^"]*)"$/.exec(text)?.[1];
  const source =
    quoted !== undefined && !ctx.enums.some((e) => sameName(e.name, quoted))
      ? quoted
      : text;
  const read = readType(source, ctx.dialect);
  if (read && !source.slice(read.length).trim()) return read;
  return {
    base: source.toLowerCase(),
    args: null,
    array: false,
    unsigned: false,
    raw: text,
    length: text.length,
  };
}

function enumLabel(column: Column, value: DbmlValue, ctx: Ctx): string | null {
  const values = ctx.enums.find((e) => e.id === column.enumId)?.values ?? [];
  const label = value.value.slice(value.value.lastIndexOf(".") + 1);
  return value.kind === "word" && values.includes(label) ? label : null;
}

function applyDbmlDefault(column: Column, value: DbmlValue, ctx: Ctx) {
  const label = enumLabel(column, value, ctx);
  const literal =
    value.kind === "string" ||
    value.kind === "quoted" ||
    value.kind === "number" ||
    (value.kind === "word" && /^(?:true|false)$/i.test(value.value));
  if (label !== null) {
    column.defaultValue = label;
    column.defaultKind = "value";
  } else if (literal) {
    column.defaultValue = value.value;
    column.defaultKind = "value";
  } else if (value.kind !== "word" || !/^null$/i.test(value.value)) {
    applyDefault(column, value.value, ctx);
  }
}

const textOf = (value: DbmlValue | undefined): string | null =>
  value && (value.kind === "string" || value.kind === "quoted") && value.value
    ? value.value
    : null;

const isPrimary = (settings: DbmlSettings) =>
  settings.flags.has("pk") || settings.flags.has("primary key");

function buildColumn(def: DbmlColumn, table: string, ctx: Ctx): Column {
  const column = columnOfType(def.name, readColumnType(def.type, ctx), table, ctx);
  const { flags, values } = def.settings;
  if (flags.has("not null")) column.isNullable = false;
  if (flags.has("unique")) column.isUnique = true;
  const fallback = values.get("default");
  if (fallback) applyDbmlDefault(column, fallback, ctx);
  if (flags.has("increment")) {
    if (ctx.dialect === "postgresql") makeSerial(column);
    else column.isAutoIncrement = true;
  }
  const note = textOf(values.get("note"));
  if (note) column.note = note;
  for (let i = 0; i < def.settings.checks; i++)
    ctx.issues.push({ kind: "checkSkipped", table });
  return column;
}

const noteOf = (table: DbmlTable): string | null =>
  table.note || textOf(table.settings.values.get("note"));

function colorOf(table: DbmlTable): string | null {
  const value = table.settings.values.get("headercolor")?.value ?? "";
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return `#${full.toUpperCase()}`;
}

interface Expanded {
  columns: DbmlColumn[];
  indexes: DbmlIndex[];
  checks: number;
  note: string | null;
  color: string | null;
}

function expand(table: DbmlTable, partials: DbmlTable[]): Expanded {
  const columns = new Map<string, { column: DbmlColumn; own: boolean }>();
  const result: Expanded = {
    columns: [],
    indexes: [...table.indexes],
    checks: table.checks,
    note: null,
    color: null,
  };
  for (const item of table.items) {
    if (item.kind === "column") {
      columns.set(item.column.name.toLowerCase(), { column: item.column, own: true });
      continue;
    }
    const partial = partials.find((p) => sameName(p.name, item.name));
    if (!partial) continue;
    for (const part of partial.items) {
      if (part.kind !== "column") continue;
      const key = part.column.name.toLowerCase();
      if (!columns.get(key)?.own) columns.set(key, { column: part.column, own: false });
    }
    result.indexes.push(...partial.indexes);
    result.checks += partial.checks;
    result.note = noteOf(partial) ?? result.note;
    result.color = colorOf(partial) ?? result.color;
  }
  result.columns = [...columns.values()].map((c) => c.column);
  result.note = noteOf(table) ?? result.note;
  result.color = colorOf(table) ?? result.color;
  return result;
}

function applyIndex(draft: TableDraft, index: DbmlIndex, ctx: Ctx) {
  const name = index.settings.values.get("name")?.value;
  const kind = isPrimary(index.settings)
    ? "primary"
    : index.settings.flags.has("unique")
      ? "unique"
      : "index";
  applyKeyDef(
    draft,
    {
      kind,
      name,
      names: index.items.filter((i) => i.kind === "column").map((i) => i.value),
      expression: index.items.some((i) => i.kind === "expr"),
      after: "",
    },
    name,
    ctx,
  );
}

function buildTable(
  source: DbmlTable,
  partials: DbmlTable[],
  ctx: Ctx,
  refs: PendingRef[],
): Entry {
  const draft: TableDraft = {
    table: { id: genId(), name: source.name, position: { x: 0, y: 0 }, columns: [] },
    schema: source.schema,
    pendingFks: [],
    primaryKey: [],
    issues: [],
  };
  const entry: Entry = { draft, alias: source.alias };
  const tableCtx = draftCtx(ctx, draft);
  const expanded = expand(source, partials);
  for (const def of expanded.columns) {
    draft.table.columns.push(buildColumn(def, source.name, tableCtx));
    for (const ref of def.settings.refs) {
      refs.push({
        from: { entry, columns: [def.name] },
        op: ref.op,
        to:
          ref.target.table === null ? { entry, columns: ref.target.columns } : ref.target,
        settings: def.settings,
        inline: true,
      });
    }
  }
  const primary = expanded.columns
    .filter((c) => isPrimary(c.settings))
    .map((c) => c.name);
  if (primary.length)
    applyKeyDef(
      draft,
      { kind: "primary", name: undefined, names: primary, expression: false, after: "" },
      undefined,
      tableCtx,
    );
  for (const index of expanded.indexes) applyIndex(draft, index, tableCtx);
  for (let i = 0; i < expanded.checks; i++)
    tableCtx.issues.push({ kind: "checkSkipped", table: source.name });
  if (expanded.note) draft.table.note = expanded.note;
  if (expanded.color) draft.table.color = expanded.color;
  return entry;
}

// DBML names are case-sensitive, so countries and Countries can both exist; a
// name that matches none exactly still finds its table, as in SQL.
function exactFirst<T>(items: T[], nameOf: (item: T) => string, name: string): T[] {
  const exact = items.filter((i) => nameOf(i) === name);
  return exact.length ? exact : items;
}

function findEntry(entries: Entry[], { schema, table }: DbmlEndpoint): Entry | undefined {
  if (table === null) return undefined;
  const nameOf = (e: Entry) => e.draft.table.name;
  const named = pick(
    exactFirst(entries, nameOf, table),
    nameOf,
    (e) => e.draft.schema,
    table,
    schema,
  );
  if (named || schema) return named;
  const aliased = entries.filter((e) => e.alias !== null && sameName(e.alias, table));
  return exactFirst(aliased, (e) => e.alias ?? "", table)[0];
}

interface Side {
  table: Table;
  columns: Column[];
}

function resolveSide(entries: Entry[], side: RefSide): Side | undefined {
  const entry = "entry" in side ? side.entry : findEntry(entries, side);
  if (!entry) return undefined;
  const table = entry.draft.table;
  const columns = side.columns.map(
    (name) => table.columns.find((c) => c.name === name) ?? findColumn(table, name),
  );
  if (columns.some((c) => !c)) return undefined;
  return { table, columns: columns.filter((c): c is Column => !!c) };
}

function referentialAction(value: DbmlValue | undefined): ReferentialAction {
  const action = value?.value.toLowerCase().replace(/\s+/g, " ");
  if (action === "cascade") return "CASCADE";
  if (action === "set null") return "SET NULL";
  if (action === "restrict") return "RESTRICT";
  return "NO ACTION";
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${i}`;
  taken.add(name.toLowerCase());
  return name;
}

interface Linker {
  relations: Relation[];
  tables: Table[];
  issues: ImportIssue[];
  taken: Set<string>;
}

function link(
  linker: Linker,
  fk: Side,
  target: Side,
  settings: DbmlSettings,
  oneToOne: boolean,
) {
  const pairs = Math.min(fk.columns.length, target.columns.length);
  for (let i = 0; i < pairs; i++) {
    const from = fk.columns[i];
    const to = target.columns[i];
    const exists = linker.relations.some(
      (r) => r.from.columnId === from.id && r.to.columnId === to.id,
    );
    if (exists) continue;
    from.isForeignKey = true;
    linker.relations.push({
      id: genId(),
      from: { tableId: fk.table.id, columnId: from.id },
      to: { tableId: target.table.id, columnId: to.id },
      type: oneToOne || from.isUnique ? "1:1" : "N:1",
      onDelete: referentialAction(settings.values.get("delete")),
      onUpdate: referentialAction(settings.values.get("update")),
    });
  }
}

function keyCopy(column: Column, name: string): Column {
  const copy: Column = {
    ...column,
    id: genId(),
    name,
    type:
      column.type === "serial"
        ? "integer"
        : column.type === "bigserial"
          ? "bigint"
          : column.type,
    isPrimaryKey: true,
    isForeignKey: false,
    isNullable: false,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
  };
  delete copy.defaultKind;
  delete copy.note;
  return copy;
}

function joinTable(linker: Linker, a: Side, b: Side, settings: DbmlSettings) {
  const table: Table = {
    id: genId(),
    name: uniqueName(`${a.table.name}_${b.table.name}`, linker.taken),
    position: { x: 0, y: 0 },
    columns: [],
  };
  const names = new Set<string>();
  const sideOf = (side: Side): Side => ({
    table,
    columns: side.columns.map((c) => {
      const copy = keyCopy(c, uniqueName(`${side.table.name}_${c.name}`, names));
      table.columns.push(copy);
      return copy;
    }),
  });
  const fromA = sideOf(a);
  const fromB = sideOf(b);
  linker.tables.push(table);
  link(linker, fromA, a, settings, false);
  link(linker, fromB, b, settings, false);
  linker.issues.push({
    kind: "joinTable",
    table: table.name,
    from: a.table.name,
    to: b.table.name,
  });
}

function resolveRefs(entries: Entry[], refs: PendingRef[], linker: Linker) {
  const sides = refs.flatMap((ref) => {
    const left = resolveSide(entries, ref.from);
    const right = resolveSide(entries, ref.to);
    return left && right ? [{ ref, left, right }] : [];
  });
  renameDuplicates(entries.map((e) => e.draft));
  for (const e of entries) linker.taken.add(e.draft.table.name.toLowerCase());
  for (const { ref, left, right } of sides) {
    if (ref.op === ">") link(linker, left, right, ref.settings, false);
    else if (ref.op === "<") link(linker, right, left, ref.settings, false);
    // In a Ref, the second column of a one-to-one holds the key; inline, the
    // column that carries the ref does.
    else if (ref.op === "-") {
      if (ref.inline) link(linker, left, right, ref.settings, true);
      else link(linker, right, left, ref.settings, true);
    } else joinTable(linker, left, right, ref.settings);
  }
}

function convert(file: DbmlFile, fallbackDbType: DbType | null): SqlImportResult {
  const detectedDbType =
    file.databaseType === null ? dialectFromTypes(file) : dialectOf(file.databaseType);
  const ctx = newCtx(detectedDbType ?? fallbackDbType);
  ctx.enums = file.enums.map((e): SchemaEnum => ({
    id: genId(),
    name: e.name,
    values: e.values,
  }));
  const refs: PendingRef[] = [];
  const entries = file.tables.map((t) => buildTable(t, file.partials, ctx, refs));
  for (const ref of file.refs) refs.push({ ...ref, inline: false });
  const linker: Linker = { relations: [], tables: [], issues: [], taken: new Set() };
  resolveRefs(entries, refs, linker);
  const tables = [...entries.map((e) => e.draft.table), ...linker.tables];
  tables.forEach(finishIndexes);
  const linked = linkEnumColumns(tables, ctx.enums);
  return {
    tables: linked.tables,
    relations: linker.relations,
    enums: linked.enums,
    detectedDbType,
    attempted: linked.tables.length,
    issues: [
      ...file.uses.map((path): ImportIssue => ({ kind: "useSkipped", path })),
      ...entries.flatMap((e) => e.draft.issues),
      ...linker.issues,
      ...file.groups.map((name): ImportIssue => ({ kind: "groupSkipped", name })),
      ...file.skipped.map((block): ImportIssue => ({ kind: "blockSkipped", ...block })),
    ],
  };
}

export function parseDbmlSchema(
  source: string,
  fallbackDbType: DbType | null = null,
): SqlImportResult {
  let file: DbmlFile;
  try {
    file = parseDbml(source);
  } catch (e) {
    if (!(e instanceof DbmlSyntaxError)) throw e;
    throw new Error(i18next.t("toast.dbmlSyntax", { line: e.line }));
  }
  return convert(file, fallbackDbType);
}
