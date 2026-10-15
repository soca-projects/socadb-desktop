import type {
  Column,
  DbType,
  ReferentialAction,
  Table,
  TableIndex,
} from "../types/schema";
import { genId } from "./id";
import { derivedIndexName } from "./indexHelpers";
import { columnList, parseColumn, readReference } from "./sqlColumns";
import type { ImportIssue, ParseCtx, Reference } from "./sqlColumns";
import { readLiteral } from "./sqlDefaults";
import {
  matchingParen,
  quoteEnd,
  readName,
  sameName,
  sameSchema,
  splitTopLevel,
} from "./sqlScan";
import type { Name } from "./sqlScan";
import { isTypeName } from "./sqlTypes";

export interface PendingFk {
  // Set when the parser knows the table itself: two tables can share a name.
  fromTableRef?: Table;
  fromTable: string;
  fromSchema?: string | null;
  fromColumn: string;
  toTable: string;
  toSchema?: string | null;
  toColumn: string | null;
  position?: number;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

export interface TableDraft {
  table: Table;
  schema: string | null;
  pendingFks: PendingFk[];
  // PRIMARY KEY (y, x) can list columns out of table order, and REFERENCES
  // without columns follows that order.
  primaryKey: string[];
  // Per table, so a dropped or ignored table takes its issues with it.
  issues: ImportIssue[];
}

export interface Ctx extends ParseCtx {
  drafts: TableDraft[];
  currentSchema: string | null;
}

export const newCtx = (dialect: DbType | null = null): Ctx => ({
  dialect,
  enums: [],
  inlineEnums: new Set(),
  issues: [],
  drafts: [],
  currentSchema: null,
});

export const draftCtx = (ctx: Ctx, draft: TableDraft): Ctx => ({
  ...ctx,
  issues: draft.issues,
});
export function findColumn(table: Table, name: string): Column | undefined {
  return table.columns.find((c) => sameName(c.name, name));
}

type KeyKind = "primary" | "unique" | "index" | "fulltext" | "spatial";

export interface KeyDef {
  kind: KeyKind;
  name: string | undefined;
  names: string[];
  expression: boolean;
  after: string;
}

const KEY_HEAD =
  /^\s*(?:(PRIMARY\s+KEY)|(UNIQUE)(?:\s+(?:KEY|INDEX))?|(FULLTEXT|SPATIAL)(?:\s+(?:KEY|INDEX))?|(KEY|INDEX))\b/i;

function keyKind(head: RegExpExecArray): KeyKind {
  if (head[1]) return "primary";
  if (head[2]) return "unique";
  if (head[3]) return head[3].toLowerCase() === "fulltext" ? "fulltext" : "spatial";
  return "index";
}

function readKeyDef(text: string, ctx: Ctx): KeyDef | null {
  const head = KEY_HEAD.exec(text);
  if (!head) return null;
  // PostgreSQL has no index inside CREATE TABLE: "key varchar(50)" is a column.
  if (head[4] && ctx.dialect === "postgresql") return null;
  const between = text.slice(head[0].length);
  const open = between.indexOf("(");
  if (open < 0) return null;
  const label = between
    .slice(0, open)
    .replace(/\bUSING\s+\w+/i, "")
    .replace(/\bNULLS\s+(?:NOT\s+)?DISTINCT\b/i, "")
    .trim();
  let name: string | undefined;
  if (label) {
    const read = readName(label);
    // MySQL reserves KEY and INDEX, so there "KEY uuid (uuid)" is an index.
    const column = head[4] && ctx.dialect !== "mysql" && isTypeName(label);
    if (!read || read.length !== label.length || column) return null;
    name = read.last;
  }
  const start = head[0].length + open;
  const close = matchingParen(text, start, ctx.dialect);
  if (close < 0) return null;
  return {
    kind: keyKind(head),
    name,
    ...columnList(text.slice(start + 1, close), ctx),
    after: text.slice(close + 1),
  };
}

function columnsNamed(table: Table, names: string[]): Column[] {
  return names.map((n) => findColumn(table, n)).filter((c): c is Column => !!c);
}

function setPrimaryKey(draft: TableDraft, names: string[]) {
  const columns = columnsNamed(draft.table, names);
  draft.primaryKey = columns.map((c) => c.id);
  for (const col of columns) {
    col.isPrimaryKey = true;
    col.isNullable = false;
    // A composite key doesn't make each of its columns unique.
    if (columns.length === 1) col.isUnique = true;
  }
}

function addIndex(
  table: Table,
  names: string[],
  unique: boolean,
  name: string | undefined,
) {
  const columns = columnsNamed(table, names);
  if (!columns.length) return;
  if (unique && columns.length === 1) {
    columns[0].isUnique = true;
    return;
  }
  const index: TableIndex = { id: genId(), columnIds: columns.map((c) => c.id), unique };
  if (name) index.name = name;
  table.indexes = [...(table.indexes ?? []), index];
}

export function applyKeyDef(
  draft: TableDraft,
  key: KeyDef,
  name: string | undefined,
  ctx: Ctx,
) {
  if (key.kind === "fulltext" || key.kind === "spatial" || key.expression) {
    ctx.issues.push({
      kind: "indexSkipped",
      table: draft.table.name,
      name: name ?? "",
      reason: key.kind === "fulltext" || key.kind === "spatial" ? key.kind : "expression",
    });
    return;
  }
  if (key.kind === "primary") setPrimaryKey(draft, key.names);
  else addIndex(draft.table, key.names, key.kind === "unique", name);
}

function addReference(
  draft: TableDraft,
  fromColumns: string[],
  ref: Reference,
  ctx: Ctx,
) {
  fromColumns.forEach((fromColumn, position) => {
    const toColumn = ref.columns.length ? ref.columns[position] : null;
    if (toColumn === undefined) return;
    draft.pendingFks.push({
      fromTableRef: draft.table,
      fromTable: draft.table.name,
      fromSchema: draft.schema,
      fromColumn,
      toTable: ref.table.last,
      toSchema: ref.table.schema ?? ctx.currentSchema,
      toColumn,
      position,
      onDelete: ref.onDelete,
      onUpdate: ref.onUpdate,
    });
  });
}

function copyColumns(draft: TableDraft, source: TableDraft | undefined, options: string) {
  if (!source) return;
  const including = (what: string) =>
    new RegExp(`\\bINCLUDING\\s+(?:ALL|${what})\\b`, "i").test(options);
  for (const col of source.table.columns) {
    const copy: Column = { ...col, id: genId(), isForeignKey: false };
    if (!including("INDEXES")) {
      copy.isPrimaryKey = false;
      copy.isUnique = false;
    }
    if (!including("DEFAULTS")) {
      copy.defaultValue = null;
      delete copy.defaultKind;
    }
    if (!including("COMMENTS")) delete copy.note;
    draft.table.columns.push(copy);
  }
}

export function applyTableElement(draft: TableDraft, def: string, ctx: Ctx) {
  let text = def.trim();
  let constraintName: string | undefined;
  const named = /^CONSTRAINT\s+/i.exec(text);
  if (named) {
    const read = readName(text.slice(named[0].length));
    if (read) {
      constraintName = read.last;
      text = text.slice(named[0].length + read.length).trim();
    }
  }

  const key = readKeyDef(text, ctx);
  if (key) {
    applyKeyDef(draft, key, constraintName ?? key.name, ctx);
    return;
  }
  const fk = /^FOREIGN\s+KEY\s*(?:\S+\s*)?\(([^)]*)\)/i.exec(text);
  if (fk) {
    const ref = readReference(text.slice(fk[0].length), ctx);
    if (ref) addReference(draft, columnList(fk[1], ctx).names, ref, ctx);
    return;
  }
  if (/^CHECK\b/i.test(text)) {
    ctx.issues.push({ kind: "checkSkipped", table: draft.table.name });
    return;
  }
  if (named || /^EXCLUDE\s+(?:USING\s+\w+\s*)?\(|^PERIOD\s+FOR\b/i.test(text)) return;
  const like = /^LIKE\s+/i.exec(text);
  const source = like && readName(text.slice(like[0].length));
  if (like && source && !isTypeName(source.last)) {
    const options = text.slice(like[0].length + source.length);
    if (/^(?:\s+(?:INCLUDING|EXCLUDING)\s+\w+)*\s*$/i.test(options)) {
      copyColumns(draft, findTable(ctx, source), options);
      return;
    }
  }

  const columnDef = text.replace(/^COLUMN\s+/i, "").replace(/^IF\s+NOT\s+EXISTS\s+/i, "");
  const scratch: Ctx = { ...ctx, issues: [] };
  const parsed = parseColumn(columnDef, draft.table.name, scratch);
  if (!parsed || findColumn(draft.table, parsed.column.name)) return;
  ctx.issues.push(...scratch.issues);
  draft.table.columns.push(parsed.column);
  if (parsed.references)
    addReference(draft, [parsed.column.name], parsed.references, ctx);
}

function tableComment(options: string, ctx: Ctx): string | null {
  const match = /\bCOMMENT\s*=?\s*/i.exec(options);
  if (!match) return null;
  const start = match.index + match[0].length;
  const end = quoteEnd(options, start, ctx.dialect);
  return end > start ? readLiteral(options.slice(start, end), ctx.dialect) : null;
}

export function finishIndexes(table: Table) {
  for (const index of table.indexes ?? []) {
    if (index.name === derivedIndexName(table, index)) delete index.name;
  }
}

const CREATE_TABLE =
  /^CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(TEMPORARY|TEMP)\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i;

export function parseTable(statement: string, ctx: Ctx): TableDraft | null {
  const head = CREATE_TABLE.exec(statement);
  if (!head || head[1]) return null;
  const name = readName(statement.slice(head[0].length));
  if (!name) return null;
  const afterName = head[0].length + name.length;
  const open = statement.indexOf("(", afterName);
  if (open < 0 || statement.slice(afterName, open).trim()) return null;
  const close = matchingParen(statement, open, ctx.dialect);
  if (close < 0) return null;

  const draft: TableDraft = {
    table: { id: genId(), name: name.last, position: { x: 0, y: 0 }, columns: [] },
    schema: name.schema ?? ctx.currentSchema,
    pendingFks: [],
    primaryKey: [],
    issues: [],
  };
  for (const def of splitTopLevel(statement.slice(open + 1, close), ",", ctx.dialect)) {
    applyTableElement(draft, def, draftCtx(ctx, draft));
  }
  const note = tableComment(statement.slice(close + 1), ctx);
  if (note) draft.table.note = note;
  return draft;
}

export function parseCreateTable(
  statement: string,
  dialect: DbType | null = null,
): { table: Table; pendingFks: PendingFk[] } | null {
  const draft = parseTable(statement, newCtx(dialect));
  if (draft) finishIndexes(draft.table);
  return draft;
}

export function pick<T>(
  candidates: T[],
  nameOf: (item: T) => string,
  schemaOf: (item: T) => string | null,
  name: string,
  schema: string | null,
): T | undefined {
  const same = candidates.filter((c) => sameName(nameOf(c), name));
  if (same.length < 2) return same[0];
  return same.find((c) => sameSchema(schemaOf(c), schema)) ?? same[0];
}

export function findDraft(
  drafts: TableDraft[],
  name: Pick<Name, "last" | "schema">,
): TableDraft | undefined {
  return pick(
    drafts,
    (d) => d.table.name,
    (d) => d.schema,
    name.last,
    name.schema,
  );
}

export function findTable(
  ctx: Ctx,
  name: Pick<Name, "last" | "schema">,
): TableDraft | undefined {
  return findDraft(ctx.drafts, {
    last: name.last,
    schema: name.schema ?? ctx.currentSchema,
  });
}
