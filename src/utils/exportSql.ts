import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import i18next from "../i18n";
import { logError } from "./log";
import type {
  Schema,
  SchemaEnum,
  Table,
  Column,
  ColumnType,
  TableIndex,
} from "../types/schema";
import { LENGTH_TYPES, MYSQL_NUMERIC_TYPES, PRECISION_TYPES } from "../types/schema";
import { defaultKindOf, defaultSql } from "./columnDefaults";
import { derivedIndexName, indexColumnNames, isIndexable } from "./indexHelpers";
import {
  findTableById,
  findColumnById,
  findEnumById,
  getRelationsFromTable,
} from "./schemaQueries";

type Fits = (name: string) => boolean;

// PostgreSQL silently cuts identifiers to 63 bytes, which can make two
// generated names equal; MySQL refuses anything over 64 characters.
const fitsPostgresql: Fits = (name) => new TextEncoder().encode(name).length <= 63;
const fitsMysql: Fits = (name) => [...name].length <= 64;

function clip(name: string, fits: Fits): string {
  let clipped = name;
  while (!fits(clipped)) clipped = [...clipped].slice(0, -1).join("");
  return clipped;
}

// MySQL compares index and constraint names regardless of case.
const foldMysql = (name: string) => name.toLowerCase();

function uniqueName(
  base: string,
  used: Set<string>,
  fits: Fits,
  fold = (name: string) => name,
): string {
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? "" : `_${i}`;
    const name = clip(base, (stem) => fits(stem + suffix)) + suffix;
    if (!used.has(fold(name))) {
      used.add(fold(name));
      return name;
    }
  }
}

function indexName(
  table: Table,
  index: TableIndex,
  used: Set<string>,
  fits: Fits,
  fold?: (name: string) => string,
): string {
  return uniqueName(index.name ?? derivedIndexName(table, index), used, fits, fold);
}

function indexColumns(table: Table, index: TableIndex, quote: (name: string) => string) {
  return indexColumnNames(table, index).map(quote).join(", ");
}

export type ExportIssue =
  | { kind: "emptyEnum"; name: string }
  | { kind: "defaultDropped"; table: string; column: string; reason: "enum" | "serial" }
  | { kind: "indexSkipped"; table: string; name: string; column: string }
  | { kind: "keyTooLong"; table: string; name: string }
  | { kind: "noteShortened"; table: string; column?: string };

export interface DdlResult {
  sql: string;
  issues: ExportIssue[];
}

interface Ctx {
  schema: Schema;
  issues: ExportIssue[];
  reportedEnums: Set<string>;
  enumNames: Map<string, string>;
}

const newCtx = (schema: Schema): Ctx => ({
  schema,
  issues: [],
  reportedEnums: new Set(),
  enumNames: new Map(),
});

function reportIfEmpty(ctx: Ctx, found: SchemaEnum) {
  if (found.values.length || ctx.reportedEnums.has(found.id)) return;
  ctx.reportedEnums.add(found.id);
  ctx.issues.push({ kind: "emptyEnum", name: found.name });
}

function columnEnum(ctx: Ctx, col: Column): SchemaEnum | undefined {
  const found = col.enumId ? findEnumById(ctx.schema, col.enumId) : undefined;
  if (found) reportIfEmpty(ctx, found);
  return found;
}

// An enum column only takes one of its values. A default that is not one of
// them, often from an import that kept the default but not the values, would
// fail CREATE TABLE in PostgreSQL and every insert in MySQL.
function fitsEnum(col: Column, values: string[]): boolean {
  const raw = col.defaultValue?.trim();
  if (!raw) return true;
  if (defaultKindOf(col) === "value") return values.includes(raw);
  const quoted = /^'(.*)'$/s.exec(raw);
  return !quoted || values.includes(quoted[1].replace(/''/g, "'"));
}

function keptDefault(ctx: Ctx, table: Table, col: Column): boolean {
  if (!col.defaultValue?.trim()) return false;
  const drop = (reason: "enum" | "serial") => {
    ctx.issues.push({
      kind: "defaultDropped",
      table: table.name,
      column: col.name,
      reason,
    });
    return false;
  };
  if (
    ctx.schema.dbType === "postgresql" &&
    (col.type === "serial" || col.type === "bigserial")
  )
    return drop("serial");
  if (col.type === "enum" && !fitsEnum(col, columnEnum(ctx, col)?.values ?? []))
    return drop("enum");
  return true;
}

function firstUnindexable(
  ctx: Ctx,
  table: Table,
  columnIds: string[],
): Column | undefined {
  return columnIds
    .map((id) => findColumnById(table, id))
    .find((c): c is Column => !!c && !isIndexable(c.type, ctx.schema.dbType));
}

function skipped(
  ctx: Ctx,
  table: Table,
  name: string,
  column: Column | undefined,
): boolean {
  if (!column) return false;
  ctx.issues.push({ kind: "indexSkipped", table: table.name, name, column: column.name });
  return true;
}

// InnoDB refuses an index key over 3072 bytes, and utf8mb4 takes up to 4 bytes
// per character.
const MYSQL_MAX_KEY_BYTES = 3072;
const MYSQL_FIXED_BYTES: Partial<Record<ColumnType, number>> = {
  tinyint: 1,
  boolean: 1,
  smallint: 2,
  mediumint: 3,
  int: 4,
  bigint: 8,
  float: 4,
  double: 8,
  date: 3,
  time: 3,
  datetime: 5,
  timestamp: 4,
  enum: 2,
};
const DECIMAL_LEFTOVER_BYTES = [0, 1, 1, 2, 2, 3, 3, 4, 4];
const decimalBytes = (digits: number) =>
  Math.floor(digits / 9) * 4 + DECIMAL_LEFTOVER_BYTES[digits % 9];

function mysqlKeyBytes(col: Column): number {
  if (LENGTH_TYPES.has(col.type)) return (col.length ?? 255) * 4;
  if (col.type === "decimal") {
    const scale = col.scale ?? 0;
    return decimalBytes(Math.max(0, (col.precision ?? 10) - scale)) + decimalBytes(scale);
  }
  return MYSQL_FIXED_BYTES[col.type] ?? 8;
}

function keyTooLong(ctx: Ctx, table: Table, name: string, columnIds: string[]): boolean {
  const bytes = columnIds
    .map((id) => findColumnById(table, id))
    .reduce((sum, c) => sum + (c ? mysqlKeyBytes(c) : 0), 0);
  if (bytes <= MYSQL_MAX_KEY_BYTES) return false;
  ctx.issues.push({ kind: "keyTooLong", table: table.name, name });
  return true;
}

function sizedType(base: string, col: Column): string {
  if (LENGTH_TYPES.has(col.type)) return `${base}(${col.length ?? 255})`;
  if (PRECISION_TYPES.has(col.type) && col.precision) {
    return col.scale !== undefined
      ? `${base}(${col.precision}, ${col.scale})`
      : `${base}(${col.precision})`;
  }
  return base;
}

const pgString = (value: string) => `'${value.replace(/'/g, "''")}'`;

// MySQL reads backslashes in string literals as escapes unless the server runs
// with NO_BACKSLASH_ESCAPES.
const mysqlString = (value: string) =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;

const MYSQL_NOW = /(?:current_timestamp|now|localtime|localtimestamp)(?:\(\d*\))?/.source;
const MYSQL_BARE_EXPRESSION = new RegExp(
  String.raw`^(?:null|true|false|-?\d+(?:\.\d+)?|'.*'|${MYSQL_NOW}(?:\s+on\s+update\s+${MYSQL_NOW})?)$`,
  "is",
);

const MYSQL_EXPRESSION_ONLY: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "text",
  "mediumtext",
  "longtext",
  "blob",
  "json",
]);

// MySQL only takes literals and CURRENT_TIMESTAMP, with its ON UPDATE, as bare
// defaults, and nothing bare on TEXT, BLOB and JSON columns: everything else
// goes in parentheses.
function mysqlDefault(col: Column): string | null {
  const sql = defaultSql(col);
  if (sql === null) return null;
  const isValue = defaultKindOf(col) === "value";
  const literal =
    isValue && sql.startsWith("'") ? mysqlString(col.defaultValue?.trim() ?? "") : sql;
  if (/^\(.*\)$/s.test(literal)) return literal;
  if (MYSQL_EXPRESSION_ONLY.has(col.type)) return `(${literal})`;
  if (isValue) return literal;
  return MYSQL_BARE_EXPRESSION.test(literal) ? literal : `(${literal})`;
}

// MySQL refuses longer comments in strict mode, its default. It counts
// characters, not bytes.
const MYSQL_COLUMN_COMMENT = 1024;
const MYSQL_TABLE_COMMENT = 2048;

function mysqlComment(
  ctx: Ctx,
  note: string,
  limit: number,
  table: Table,
  column?: Column,
) {
  const chars = [...note];
  if (chars.length <= limit) return mysqlString(note);
  ctx.issues.push({
    kind: "noteShortened",
    table: table.name,
    ...(column ? { column: column.name } : {}),
  });
  return mysqlString(`${chars.slice(0, limit - 1).join("")}…`);
}

function mysqlColumnDef(ctx: Ctx, table: Table, col: Column, unsigned: boolean): string {
  let def = `  \`${col.name}\` ${mysqlType(ctx, col)}`;
  if (unsigned) def += " UNSIGNED";
  if (!col.isNullable) def += " NOT NULL";
  if (col.isAutoIncrement) {
    def += " AUTO_INCREMENT";
  } else if (keptDefault(ctx, table, col)) {
    const defaultValue = mysqlDefault(col);
    if (defaultValue) def += ` DEFAULT ${defaultValue}`;
  }
  if (col.note)
    def += ` COMMENT ${mysqlComment(ctx, col.note, MYSQL_COLUMN_COMMENT, table, col)}`;
  return def;
}

function mysqlType(ctx: Ctx, col: Column): string {
  switch (col.type) {
    case "boolean":
      return "TINYINT(1)";
    case "enum": {
      const values = columnEnum(ctx, col)?.values ?? [];
      // MySQL has no empty ENUM(); the single empty string keeps the table valid.
      return values.length ? `ENUM(${values.map(mysqlString).join(", ")})` : "ENUM('')";
    }
    default:
      return sizedType(col.type.toUpperCase(), col);
  }
}

// MySQL refuses a foreign key whose sign differs from the key it references, so
// a foreign key column takes that key's exported sign, down a chain of keys,
// whatever its own flag says.
function mysqlUnsigned(
  schema: Schema,
  table: Table,
  col: Column,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (!MYSQL_NUMERIC_TYPES.has(col.type) || seen.has(col.id)) return !!col.unsigned;
  const relation = getRelationsFromTable(schema, table.id).find(
    (r) => r.from.columnId === col.id,
  );
  const toTable = relation && findTableById(schema, relation.to.tableId);
  const target = relation && toTable && findColumnById(toTable, relation.to.columnId);
  if (!toTable || !target || !MYSQL_NUMERIC_TYPES.has(target.type)) return !!col.unsigned;
  return mysqlUnsigned(schema, toTable, target, new Set([...seen, col.id]));
}

function generateMysqlTable(ctx: Ctx, table: Table, fkNames: Set<string>): string {
  const { schema } = ctx;
  const lines: string[] = [];

  lines.push(`CREATE TABLE \`${table.name}\` (`);

  const defs: string[] = table.columns.map((col) =>
    mysqlColumnDef(ctx, table, col, mysqlUnsigned(schema, table, col)),
  );

  const pks = table.columns.filter((c) => c.isPrimaryKey);
  if (pks.length > 0) {
    defs.push(`  PRIMARY KEY (${pks.map((c) => `\`${c.name}\``).join(", ")})`);
  }

  const used = new Set<string>(["primary"]);
  const uniques = table.columns.filter((c) => c.isUnique && !c.isPrimaryKey);
  for (const col of uniques) {
    const name = uniqueName(`uk_${table.name}_${col.name}`, used, fitsMysql, foldMysql);
    if (skipped(ctx, table, name, firstUnindexable(ctx, table, [col.id]))) continue;
    if (keyTooLong(ctx, table, name, [col.id])) continue;
    defs.push(`  UNIQUE KEY \`${name}\` (\`${col.name}\`)`);
  }

  for (const index of table.indexes ?? []) {
    const name = indexName(table, index, used, fitsMysql, foldMysql);
    if (skipped(ctx, table, name, firstUnindexable(ctx, table, index.columnIds)))
      continue;
    if (keyTooLong(ctx, table, name, index.columnIds)) continue;
    const columns = indexColumns(table, index, (n) => `\`${n}\``);
    defs.push(`  ${index.unique ? "UNIQUE KEY" : "KEY"} \`${name}\` (${columns})`);
  }

  const fks = getRelationsFromTable(schema, table.id);
  for (const rel of fks) {
    const fromCol = findColumnById(table, rel.from.columnId);
    const toTable = findTableById(schema, rel.to.tableId);
    const toCol = toTable ? findColumnById(toTable, rel.to.columnId) : undefined;
    if (fromCol && toTable && toCol) {
      const name = uniqueName(
        `fk_${table.name}_${fromCol.name}`,
        fkNames,
        fitsMysql,
        foldMysql,
      );
      defs.push(
        `  CONSTRAINT \`${name}\` FOREIGN KEY (\`${fromCol.name}\`) REFERENCES \`${toTable.name}\` (\`${toCol.name}\`) ON DELETE ${rel.onDelete} ON UPDATE ${rel.onUpdate}`,
      );
    }
  }

  lines.push(defs.join(",\n"));
  lines.push(
    table.note
      ? `) ENGINE=InnoDB COMMENT=${mysqlComment(ctx, table.note, MYSQL_TABLE_COMMENT, table)};`
      : ") ENGINE=InnoDB;",
  );

  return lines.join("\n");
}

export function buildMysqlDdl(schema: Schema): DdlResult {
  const ctx = newCtx(schema);
  // Foreign key names are unique per database in MySQL, index names per table.
  const fkNames = new Set<string>();
  const sql = [
    "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;",
    ...schema.tables.map((t) => generateMysqlTable(ctx, t, fkNames)),
    "SET FOREIGN_KEY_CHECKS = 1;",
  ].join("\n\n");
  return { sql, issues: ctx.issues };
}

export const generateMysqlDdl = (schema: Schema): string => buildMysqlDdl(schema).sql;

function postgresqlColumnDef(ctx: Ctx, table: Table, col: Column): string {
  let def = `  "${col.name}" ${postgresqlType(ctx, col)}`;
  if (!col.isNullable) def += " NOT NULL";
  if (keptDefault(ctx, table, col)) {
    const defaultValue = defaultSql(col);
    if (defaultValue) def += ` DEFAULT ${defaultValue}`;
  }
  return def;
}

function postgresqlType(ctx: Ctx, col: Column): string {
  switch (col.type) {
    case "double precision":
      return "DOUBLE PRECISION";
    case "enum": {
      const found = columnEnum(ctx, col);
      return found ? `"${ctx.enumNames.get(found.id) ?? found.name}"` : "TEXT";
    }
    default:
      return sizedType(col.type.toUpperCase(), col);
  }
}

function generatePostgresqlTable(ctx: Ctx, table: Table, used: Set<string>): string {
  const lines: string[] = [];

  lines.push(`CREATE TABLE "${table.name}" (`);

  const defs: string[] = table.columns.map((col) => postgresqlColumnDef(ctx, table, col));

  const pks = table.columns.filter((c) => c.isPrimaryKey);
  if (pks.length > 0) {
    defs.push(`  PRIMARY KEY (${pks.map((c) => `"${c.name}"`).join(", ")})`);
  }

  const uniques = table.columns.filter((c) => c.isUnique && !c.isPrimaryKey);
  for (const col of uniques) {
    const name = uniqueName(`uk_${table.name}_${col.name}`, used, fitsPostgresql);
    if (skipped(ctx, table, name, firstUnindexable(ctx, table, [col.id]))) continue;
    defs.push(`  CONSTRAINT "${name}" UNIQUE ("${col.name}")`);
  }

  lines.push(defs.join(",\n"));
  lines.push(");");

  return lines.join("\n");
}

function generatePostgresqlForeignKeys(schema: Schema): string {
  const fks: string[] = [];
  const fkNames = new Set<string>();

  for (const table of schema.tables) {
    for (const rel of getRelationsFromTable(schema, table.id)) {
      const fromCol = findColumnById(table, rel.from.columnId);
      const toTable = findTableById(schema, rel.to.tableId);
      const toCol = toTable ? findColumnById(toTable, rel.to.columnId) : undefined;
      if (fromCol && toTable && toCol) {
        const name = uniqueName(
          `fk_${table.name}_${fromCol.name}`,
          fkNames,
          fitsPostgresql,
        );
        fks.push(
          `ALTER TABLE "${table.name}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${fromCol.name}") REFERENCES "${toTable.name}" ("${toCol.name}") ON DELETE ${rel.onDelete} ON UPDATE ${rel.onUpdate};`,
        );
      }
    }
  }

  return fks.join("\n");
}

function generatePostgresqlIndexes(ctx: Ctx, used: Set<string>): string {
  return ctx.schema.tables
    .flatMap((table) =>
      (table.indexes ?? []).flatMap((index) => {
        const name = indexName(table, index, used, fitsPostgresql);
        if (skipped(ctx, table, name, firstUnindexable(ctx, table, index.columnIds)))
          return [];
        const columns = indexColumns(table, index, (n) => `"${n}"`);
        return [
          `CREATE ${index.unique ? "UNIQUE INDEX" : "INDEX"} "${name}" ON "${table.name}" (${columns});`,
        ];
      }),
    )
    .join("\n");
}

function generatePostgresqlComments(schema: Schema): string {
  return schema.tables
    .flatMap((table) => [
      ...(table.note
        ? [`COMMENT ON TABLE "${table.name}" IS ${pgString(table.note)};`]
        : []),
      ...table.columns
        .filter((col) => col.note)
        .map(
          (col) =>
            `COMMENT ON COLUMN "${table.name}"."${col.name}" IS ${pgString(col.note ?? "")};`,
        ),
    ])
    .join("\n");
}

export function buildPostgresqlDdl(schema: Schema): DdlResult {
  const ctx = newCtx(schema);
  // Across the whole PostgreSQL schema, indexes share their names with tables
  // and the indexes behind UNIQUE constraints, and enums with tables, through
  // each table's row type. Names are compared once cut to 63 bytes.
  const tableNames = schema.tables.map((t) => clip(t.name, fitsPostgresql));
  const used = new Set(tableNames);
  const typeNames = new Set(tableNames);
  const types = (schema.enums ?? [])
    .map((e) => {
      reportIfEmpty(ctx, e);
      const name = uniqueName(e.name, typeNames, fitsPostgresql);
      ctx.enumNames.set(e.id, name);
      return `CREATE TYPE "${name}" AS ENUM (${e.values.map(pgString).join(", ")});`;
    })
    .join("\n");
  const tables = schema.tables
    .map((t) => generatePostgresqlTable(ctx, t, used))
    .join("\n\n");
  const sql = [
    "SET client_encoding = 'UTF8';",
    types,
    tables,
    generatePostgresqlIndexes(ctx, used),
    generatePostgresqlForeignKeys(schema),
    generatePostgresqlComments(schema),
  ]
    .filter(Boolean)
    .join("\n\n");
  return { sql, issues: ctx.issues };
}

export const generatePostgresqlDdl = (schema: Schema): string =>
  buildPostgresqlDdl(schema).sql;

const SHOWN_ISSUES = 3;

function describeIssue(issue: ExportIssue): string {
  switch (issue.kind) {
    case "emptyEnum":
      return i18next.t("exportIssues.emptyEnum", { name: issue.name });
    case "defaultDropped":
      return i18next.t(
        issue.reason === "serial"
          ? "exportIssues.defaultDroppedSerial"
          : "exportIssues.defaultDroppedEnum",
        { table: issue.table, column: issue.column },
      );
    case "indexSkipped":
      return i18next.t("exportIssues.indexSkipped", {
        name: issue.name,
        table: issue.table,
        column: issue.column,
      });
    case "keyTooLong":
      return i18next.t("exportIssues.keyTooLong", {
        name: issue.name,
        table: issue.table,
      });
    case "noteShortened":
      return i18next.t("exportIssues.noteShortened", {
        target: issue.column ? `${issue.table}.${issue.column}` : issue.table,
      });
  }
}

function describeIssues(issues: ExportIssue[]): string {
  const lines = issues.slice(0, SHOWN_ISSUES).map(describeIssue);
  if (issues.length > SHOWN_ISSUES) {
    lines.push(i18next.t("exportIssues.more", { count: issues.length - SHOWN_ISSUES }));
  }
  return lines.join(" ");
}

export async function exportSql() {
  try {
    const { schema } = useSchemaStore.getState();
    const schemaName = schema.name || "schema";

    const { sql, issues } =
      schema.dbType === "mysql" ? buildMysqlDdl(schema) : buildPostgresqlDdl(schema);

    const path = await save({
      defaultPath: `${schemaName}.sql`,
      filters: [{ name: i18next.t("fileFilter.sql"), extensions: ["sql"] }],
    });
    if (!path) return;

    await writeTextFile(path, sql);
    if (issues.length) {
      toast.warning(i18next.t("toast.exportSqlIssues", { count: issues.length }), {
        description: describeIssues(issues),
        duration: 10_000,
      });
    }
  } catch (e) {
    logError("export.sql.failed", e);
    toast.error(i18next.t("toast.exportSqlFailed", { error: String(e) }));
  }
}
