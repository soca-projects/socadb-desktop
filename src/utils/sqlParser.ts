import type { DbType, Relation, SchemaEnum, Table } from "../types/schema";
import { genId } from "./id";
import { uniqueEnumName } from "./schemaIntegrity";
import {
  applyDefault,
  columnList,
  enumValues,
  makeSerial,
  parseColumn,
} from "./sqlColumns";
import type { ImportIssue } from "./sqlColumns";
import { readLiteral } from "./sqlDefaults";
import {
  matchingParen,
  readName,
  sameName,
  sameSchema,
  splitTopLevel,
  stripComments,
  withoutStrings,
} from "./sqlScan";
import {
  applyKeyDef,
  applyTableElement,
  draftCtx,
  findColumn,
  findDraft,
  findTable,
  finishIndexes,
  newCtx,
  parseTable,
  pick,
} from "./sqlTables";
import type { Ctx, KeyDef, PendingFk, TableDraft } from "./sqlTables";

export function detectDbType(sql: string): DbType | null {
  // Comments and strings say nothing about the dialect: a Prisma warning or a
  // note in backticks would otherwise read as MySQL. MySQL's # comments go too,
  // which stripComments only removes once it knows the dialect.
  const code = withoutStrings(stripComments(sql.replace(/^[ \t]*#[^\n]*/gm, "")));
  const upper = code.toUpperCase();

  const mysqlSignals = [
    /`/g,
    /\bAUTO_INCREMENT\b/g,
    /\bENGINE\s*=/g,
    /\bTINYINT\b/g,
    /\bMEDIUMINT\b/g,
    /\bMEDIUMTEXT\b/g,
    /\bLONGTEXT\b/g,
    /\bUNSIGNED\b/g,
  ];
  const postgresqlSignals = [
    /\bSERIAL\b/g,
    /\bBIGSERIAL\b/g,
    /\bTIMESTAMPTZ\b/g,
    /\bBYTEA\b/g,
    /\bJSONB\b/g,
    /\bUUID\b/g,
    /\bCHARACTER\s+VARYING\b/g,
    /\bCREATE\s+TYPE\b/g,
    /\bCOMMENT\s+ON\b/g,
    /\bALTER\s+TABLE\s+ONLY\b/g,
    /\bNEXTVAL\s*\(/g,
    /::/g,
    /\bPG_CATALOG\b/g,
    /\bOWNER\s+TO\b/g,
  ];

  let mysqlScore = 0;
  let pgScore = 0;

  for (const re of mysqlSignals) {
    const matches = upper.match(re);
    if (matches) mysqlScore += matches.length;
  }
  // MySQL's conditional comments are gone with the comments, yet only mysqldump
  // writes them.
  mysqlScore += sql.match(/\/\*!\d+/g)?.length ?? 0;

  if (!code.includes("`")) {
    const dqMatches = code.match(/"/g);
    if (dqMatches && dqMatches.length >= 2) pgScore += 1;
  }

  for (const re of postgresqlSignals) {
    const matches = upper.match(re);
    if (matches) pgScore += matches.length;
  }

  if (mysqlScore > pgScore) return "mysql";
  if (pgScore > mysqlScore) return "postgresql";
  return null;
}

function parseEnumType(statement: string, ctx: Ctx): SchemaEnum | null {
  const head = /^CREATE\s+TYPE\s+/i.exec(statement);
  const name = head && readName(statement.slice(head[0].length));
  if (!head || !name) return null;
  const rest = statement.slice(head[0].length + name.length);
  const body = /^\s*AS\s+ENUM\s*\(/i.exec(rest);
  if (!body) return null;
  const open = body[0].length - 1;
  const close = matchingParen(rest, open, ctx.dialect);
  if (close < 0) return null;
  return {
    id: genId(),
    name: name.last,
    values: enumValues(rest.slice(open + 1, close), ctx.dialect),
  };
}

const CREATE_INDEX =
  /^CREATE\s+(?:(UNIQUE|FULLTEXT|SPATIAL)\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i;

function applyCreateIndex(statement: string, ctx: Ctx) {
  const head = CREATE_INDEX.exec(statement);
  if (!head) return;
  let rest = statement.slice(head[0].length);
  let name: string | undefined;
  if (!/^ON\s/i.test(rest)) {
    const read = readName(rest);
    if (!read) return;
    name = read.last;
    rest = rest.slice(read.length).trim();
  }
  const on = /^ON\s+(?:ONLY\s+)?/i.exec(rest);
  const tableName = on && readName(rest.slice(on[0].length));
  const draft = tableName && findTable(ctx, tableName);
  if (!on || !tableName || !draft) return;
  rest = rest.slice(on[0].length + tableName.length).replace(/^\s*USING\s+\w+/i, "");
  const open = rest.indexOf("(");
  if (open < 0 || rest.slice(0, open).trim()) return;
  const close = matchingParen(rest, open, ctx.dialect);
  if (close < 0) return;
  const kind = head[1]?.toLowerCase();
  const key: KeyDef = {
    kind: kind === "unique" || kind === "fulltext" || kind === "spatial" ? kind : "index",
    name,
    ...columnList(rest.slice(open + 1, close), ctx),
    after: rest.slice(close + 1),
  };
  applyKeyDef(draft, key, name, draftCtx(ctx, draft));
  const skippedAlready =
    key.expression || key.kind === "fulltext" || key.kind === "spatial";
  if (!skippedAlready && /\bWHERE\b/i.test(key.after))
    draft.issues.push({
      kind: "indexCondition",
      table: draft.table.name,
      name: name ?? "",
    });
}

// phpMyAdmin sets AUTO_INCREMENT with MODIFY, after the tables.
function replaceColumn(draft: TableDraft, def: string, renames: boolean, ctx: Ctx) {
  let text = def;
  let oldName: string | undefined;
  if (renames) {
    const old = readName(text);
    if (!old) return;
    oldName = old.last;
    text = text.slice(old.length).trim();
  }
  const parsed = parseColumn(text, draft.table.name, draftCtx(ctx, draft));
  if (!parsed) return;
  const index = draft.table.columns.findIndex((c) =>
    sameName(c.name, oldName ?? parsed.column.name),
  );
  if (index < 0) return;
  const old = draft.table.columns[index];
  const created = ctx.enums.find(
    (e) => e.id === parsed.column.enumId && e.id !== old.enumId,
  );
  const previous = ctx.enums.find((e) => e.id === old.enumId);
  if (created && previous) {
    previous.values = created.values;
    ctx.enums.splice(ctx.enums.indexOf(created), 1);
    parsed.column.enumId = previous.id;
  }
  draft.table.columns[index] = {
    ...parsed.column,
    id: old.id,
    isPrimaryKey: old.isPrimaryKey || parsed.column.isPrimaryKey,
    isUnique: old.isUnique || parsed.column.isUnique,
    isNullable: parsed.column.isNullable && !old.isPrimaryKey,
  };
  if (oldName && !sameName(oldName, parsed.column.name))
    renameInForeignKeys(ctx, draft, oldName, parsed.column.name);
}

function renameInForeignKeys(ctx: Ctx, draft: TableDraft, from: string, to: string) {
  for (const fk of ctx.drafts.flatMap((d) => d.pendingFks)) {
    if (draft.pendingFks.includes(fk) && sameName(fk.fromColumn, from))
      fk.fromColumn = to;
    const target = findDraft(ctx.drafts, {
      last: fk.toTable,
      schema: fk.toSchema ?? null,
    });
    if (target === draft && fk.toColumn !== null && sameName(fk.toColumn, from))
      fk.toColumn = to;
  }
}

function applyAlterTable(statement: string, ctx: Ctx) {
  const head = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?/i.exec(statement);
  const name = head && readName(statement.slice(head[0].length));
  const draft = name && findTable(ctx, name);
  if (!head || !name || !draft) return;
  const actions = statement.slice(head[0].length + name.length);
  for (const action of splitTopLevel(actions, ",", ctx.dialect)) {
    const add = /^ADD\s+/i.exec(action);
    if (add) {
      applyTableElement(draft, action.slice(add[0].length), draftCtx(ctx, draft));
      continue;
    }
    const redefine = /^(MODIFY|CHANGE)\s+(?:COLUMN\s+)?/i.exec(action);
    if (redefine) {
      const renames = redefine[1].toUpperCase() === "CHANGE";
      replaceColumn(draft, action.slice(redefine[0].length), renames, ctx);
      continue;
    }
    const alter = /^ALTER\s+(?:COLUMN\s+)?/i.exec(action);
    const column = alter && readName(action.slice(alter[0].length));
    const col = column && findColumn(draft.table, column.last);
    if (!alter || !column || !col) continue;
    const change = action.slice(alter[0].length + column.length).trim();
    const setDefault = /^SET\s+DEFAULT\s+/i.exec(change);
    if (setDefault) applyDefault(col, change.slice(setDefault[0].length), ctx);
    else if (/^ADD\s+GENERATED\b[\s\S]*\bIDENTITY\b/i.test(change)) makeSerial(col);
    else if (/^SET\s+NOT\s+NULL\b/i.test(change)) col.isNullable = false;
  }
}

function applyCommentOn(statement: string, ctx: Ctx) {
  const head = /^COMMENT\s+ON\s+(TABLE|COLUMN)\s+/i.exec(statement);
  const target = head && readName(statement.slice(head[0].length));
  if (!head || !target) return;
  const after = statement.slice(head[0].length + target.length);
  const is = /^\s*IS\s+/i.exec(after);
  if (!is) return;
  const note = readLiteral(after.slice(is[0].length), ctx.dialect);
  const onColumn = head[1].toUpperCase() === "COLUMN";
  const tableParts = onColumn ? target.parts.slice(0, -1) : target.parts;
  const last = tableParts[tableParts.length - 1];
  const schema = tableParts[tableParts.length - 2] ?? null;
  const draft = last ? findTable(ctx, { last, schema }) : undefined;
  const owner = draft && (onColumn ? findColumn(draft.table, target.last) : draft.table);
  if (!owner) return;
  if (note) owner.note = note;
  else delete owner.note;
}

interface TableLookup {
  schemaOf?: (table: Table) => string | null;
  primaryKeyOf?: (table: Table) => string[];
}

export function resolveForeignKeys(
  tables: Table[],
  pendingFks: PendingFk[],
  {
    schemaOf = () => null,
    primaryKeyOf = (t) => t.columns.filter((c) => c.isPrimaryKey).map((c) => c.id),
  }: TableLookup = {},
): Relation[] {
  const relations: Relation[] = [];
  const find = (name: string, schema: string | null | undefined) =>
    pick(tables, (t) => t.name, schemaOf, name, schema ?? null);

  for (const fk of pendingFks) {
    const fromTable = fk.fromTableRef ?? find(fk.fromTable, fk.fromSchema);
    const toTable = find(fk.toTable, fk.toSchema);
    if (!fromTable || !toTable) continue;

    const fromColumn = findColumn(fromTable, fk.fromColumn);
    const keyId = fk.toColumn === null ? primaryKeyOf(toTable)[fk.position ?? 0] : null;
    const toColumn =
      fk.toColumn === null
        ? toTable.columns.find((c) => c.id === keyId)
        : findColumn(toTable, fk.toColumn);
    if (!fromColumn || !toColumn) continue;

    fromColumn.isForeignKey = true;

    relations.push({
      id: genId(),
      from: { tableId: fromTable.id, columnId: fromColumn.id },
      to: { tableId: toTable.id, columnId: toColumn.id },
      type: fromColumn.isUnique ? "1:1" : "N:1",
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate,
    });
  }

  return relations;
}

// SocaDB has no schemas: auth.users and public.users both become tables, the
// one outside the default schema named after its schema.
export function renameDuplicates(drafts: TableDraft[]) {
  const taken = new Set(drafts.map((d) => d.table.name.toLowerCase()));
  for (const draft of drafts) {
    const twins = drafts.filter((d) => sameName(d.table.name, draft.table.name));
    const keeper = twins.find((d) => sameSchema(d.schema, null)) ?? twins[0];
    if (twins.length < 2 || draft === keeper) continue;
    const base =
      draft.schema && !sameSchema(draft.schema, keeper.schema)
        ? `${draft.schema}_${draft.table.name}`
        : draft.table.name;
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${i}`;
    taken.add(name.toLowerCase());
    draft.table.name = name;
    for (const issue of draft.issues) if ("table" in issue) issue.table = name;
  }
}

export interface ParsedSql {
  tables: Table[];
  relations: Relation[];
  enums: SchemaEnum[];
  issues: ImportIssue[];
  attempted: number;
}

// MySQL's inline enums are named once the tables are final: a dropped table
// would otherwise hold the name, and a renamed one keep its old prefix.
function nameInlineEnums(ctx: Ctx, tables: Table[]): SchemaEnum[] {
  const kept = ctx.enums.filter((e) => !ctx.inlineEnums.has(e.id));
  const tableNames = tables.map((t) => t.name);
  for (const table of tables) {
    for (const column of table.columns) {
      const inline = ctx.enums.find(
        (e) => e.id === column.enumId && ctx.inlineEnums.has(e.id) && !kept.includes(e),
      );
      if (!inline) continue;
      inline.name = uniqueEnumName(`${table.name}_${column.name}`, kept, tableNames);
      kept.push(inline);
    }
  }
  return ctx.enums.filter((e) => kept.includes(e));
}

const CREATE_TABLE_STATEMENT =
  /^CREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:UNLOGGED\s+)?TABLE\b/i;

function repeatsTable(draft: TableDraft, statement: string, ctx: Ctx): boolean {
  return (
    /^[^(]*\bIF\s+NOT\s+EXISTS\b/i.test(statement) &&
    ctx.drafts.some(
      (d) =>
        sameName(d.table.name, draft.table.name) && sameSchema(d.schema, draft.schema),
    )
  );
}

function dropTables(statement: string, ctx: Ctx) {
  const head = /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?/i.exec(statement);
  if (!head) return;
  for (const part of splitTopLevel(statement.slice(head[0].length), ",", ctx.dialect)) {
    const name = readName(part);
    const draft = name && findTable(ctx, name);
    if (draft && sameSchema(draft.schema, name.schema ?? ctx.currentSchema))
      ctx.drafts.splice(ctx.drafts.indexOf(draft), 1);
  }
}

// Types come first, whatever their order in the file: a column may use one
// before its CREATE TYPE. The rest runs in file order, as the database would,
// so a table dropped and created again is the second one. Foreign keys resolve
// at the end, since they can name a table created further down.
export function parseStatements(statements: string[], dialect: DbType | null): ParsedSql {
  const ctx = newCtx(dialect);
  for (const statement of statements) {
    const created = parseEnumType(statement, ctx);
    if (created) ctx.enums.push(created);
  }
  let failed = 0;
  for (const statement of statements) {
    const use = /^USE\s+/i.exec(statement);
    if (use) ctx.currentSchema = readName(statement.slice(use[0].length))?.last ?? null;
    else if (CREATE_TABLE_STATEMENT.test(statement)) {
      const draft = parseTable(statement, ctx);
      if (!draft) failed++;
      else if (!repeatsTable(draft, statement, ctx)) ctx.drafts.push(draft);
    } else if (/^DROP\s+TABLE\b/i.test(statement)) dropTables(statement, ctx);
    else if (/^ALTER\s+TABLE\b/i.test(statement)) applyAlterTable(statement, ctx);
    else if (CREATE_INDEX.test(statement)) applyCreateIndex(statement, ctx);
    else if (/^COMMENT\s+ON\b/i.test(statement)) applyCommentOn(statement, ctx);
  }
  const tables = ctx.drafts.map((d) => d.table);
  const drafts = new Map(ctx.drafts.map((d) => [d.table, d]));
  const relations = resolveForeignKeys(
    tables,
    ctx.drafts.flatMap((d) => d.pendingFks),
    {
      schemaOf: (t) => drafts.get(t)?.schema ?? null,
      primaryKeyOf: (t) => {
        const declared = drafts.get(t)?.primaryKey ?? [];
        return declared.length
          ? declared
          : t.columns.filter((c) => c.isPrimaryKey).map((c) => c.id);
      },
    },
  );
  renameDuplicates(ctx.drafts);
  tables.forEach(finishIndexes);
  return {
    tables,
    relations,
    enums: nameInlineEnums(ctx, tables),
    issues: ctx.drafts.flatMap((d) => d.issues),
    attempted: tables.length + failed,
  };
}
