import type {
  Table,
  Column,
  Relation,
  DbType,
  ColumnType,
  ReferentialAction,
} from "../types/schema";
import { COLUMN_TYPES_BY_DB } from "../types/schema";
import { genId } from "./id";

export interface SqlImportResult {
  tables: Table[];
  relations: Relation[];
  detectedDbType: DbType | null;
  attempted: number;
}

interface PendingFk {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
}

function stripComments(sql: string): string {
  let result = sql.replace(/--[^\n]*/g, "");
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  return result;
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";

    if (ch === "'" && !inDoubleQuote && prev !== "\\") {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote && prev !== "\\") {
      inDoubleQuote = !inDoubleQuote;
    }

    if (ch === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

function stripQuotes(name: string): string {
  const trimmed = name.trim();
  if (
    (trimmed.startsWith("`") && trimmed.endsWith("`")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = i > 0 ? body[i - 1] : "";

    if (ch === "'" && !inDoubleQuote && prev !== "\\") {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote && prev !== "\\") {
      inDoubleQuote = !inDoubleQuote;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }

    if (ch === "," && depth === 0 && !inSingleQuote && !inDoubleQuote) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);

  return parts;
}

export function detectDbType(sql: string): DbType | null {
  const upper = sql.toUpperCase();

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
  ];

  let mysqlScore = 0;
  let pgScore = 0;

  for (const re of mysqlSignals) {
    const matches = upper.match(re);
    if (matches) mysqlScore += matches.length;
  }

  if (!sql.includes("`")) {
    const dqMatches = sql.match(/"/g);
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

const TYPE_ALIASES: Record<string, ColumnType> = {
  int: "int",
  integer: "integer",
  bigint: "bigint",
  tinyint: "tinyint",
  smallint: "smallint",
  mediumint: "mediumint",
  float: "float",
  real: "real",
  double: "double",
  "double precision": "double precision",
  decimal: "decimal",
  numeric: "numeric",
  varchar: "varchar",
  "character varying": "varchar",
  char: "char",
  character: "char",
  text: "text",
  mediumtext: "mediumtext",
  longtext: "longtext",
  boolean: "boolean",
  bool: "boolean",
  tinyint1: "boolean",
  date: "date",
  time: "time",
  datetime: "datetime",
  timestamp: "timestamp",
  timestamptz: "timestamptz",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  json: "json",
  jsonb: "jsonb",
  enum: "enum",
  blob: "blob",
  bytea: "bytea",
  uuid: "uuid",
  serial: "serial",
  bigserial: "bigserial",
};

function normalizeColumnType(rawType: string): ColumnType {
  const withParens = rawType.trim().toLowerCase();
  if (withParens === "tinyint(1)") return "boolean";

  const base = rawType
    .replace(/\(.*\)/, "")
    .trim()
    .toLowerCase();

  return TYPE_ALIASES[base] ?? "varchar";
}

function parseReferentialAction(value: string): ReferentialAction {
  const upper = value.toUpperCase().trim();
  if (upper === "CASCADE") return "CASCADE";
  if (upper === "SET NULL") return "SET NULL";
  if (upper === "RESTRICT") return "RESTRICT";
  return "NO ACTION";
}

function extractReferentialActions(def: string): {
  onDelete: ReferentialAction;
  onUpdate: ReferentialAction;
} {
  let onDelete: ReferentialAction = "NO ACTION";
  let onUpdate: ReferentialAction = "NO ACTION";

  const deleteMatch = def.match(
    /ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)/i,
  );
  if (deleteMatch) onDelete = parseReferentialAction(deleteMatch[1]);

  const updateMatch = def.match(
    /ON\s+UPDATE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)/i,
  );
  if (updateMatch) onUpdate = parseReferentialAction(updateMatch[1]);

  return { onDelete, onUpdate };
}

function parseColumnDef(def: string): Column | null {
  const upper = def.toUpperCase().trim();

  if (
    upper.startsWith("PRIMARY KEY") ||
    upper.startsWith("UNIQUE") ||
    upper.startsWith("FOREIGN KEY") ||
    upper.startsWith("CONSTRAINT") ||
    upper.startsWith("KEY ") ||
    upper.startsWith("INDEX ")
  ) {
    return null;
  }

  const match = def.match(/^(`[^`]+`|"[^"]+"|[\w]+)\s+(.+)$/s);
  if (!match) return null;

  const name = stripQuotes(match[1]);
  const rest = match[2];

  const typeMatch = rest.match(
    /^((?:`[^`]+`|"[^"]+"|[^,])*?)(?:\s+(?:NOT\s+NULL|NULL|DEFAULT|AUTO_INCREMENT|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK|COMMENT|GENERATED|ON\s+UPDATE)|\s*$)/i,
  );
  const rawType = typeMatch ? typeMatch[1].trim() : rest.split(/\s+/)[0];
  const cleanType = rawType.replace(/\s+UNSIGNED/i, "");

  const type = normalizeColumnType(cleanType);
  const upperRest = rest.toUpperCase();

  const isAutoIncrement =
    upperRest.includes("AUTO_INCREMENT") || type === "serial" || type === "bigserial";

  const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
  const isNullable = !upperRest.includes("NOT NULL") && !isPrimaryKey;
  const isUnique = /\bUNIQUE\b/i.test(rest) || isPrimaryKey;

  let defaultValue: string | null = null;
  const defaultMatch = rest.match(/DEFAULT\s+('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S+)/i);
  if (defaultMatch) {
    defaultValue = defaultMatch[1];
    if (
      (defaultValue.startsWith("'") && defaultValue.endsWith("'")) ||
      (defaultValue.startsWith('"') && defaultValue.endsWith('"'))
    ) {
      defaultValue = defaultValue.slice(1, -1);
    }
  }

  return {
    id: genId(),
    name,
    type,
    isPrimaryKey,
    isForeignKey: false,
    isNullable,
    isUnique,
    isAutoIncrement,
    defaultValue,
  };
}

function parseCreateTable(statement: string): {
  table: Table;
  pendingFks: PendingFk[];
} | null {
  const match = statement.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(`[^`]+`|"[^"]+"|[\w.]+)\s*\(([\s\S]+)\)/i,
  );
  if (!match) return null;

  const rawName = match[1];
  const nameParts = rawName.split(".");
  const tableName = stripQuotes(nameParts[nameParts.length - 1]);
  const body = match[2];

  const definitions = splitTopLevelCommas(body);
  const columns: Column[] = [];
  const pendingFks: PendingFk[] = [];
  const primaryKeyColumns: string[] = [];
  const uniqueColumns: string[] = [];

  for (const def of definitions) {
    const trimmed = def.trim();
    const upper = trimmed.toUpperCase();

    if (
      upper.startsWith("PRIMARY KEY") ||
      /^CONSTRAINT\s+\S+\s+PRIMARY\s+KEY/i.test(upper)
    ) {
      const pkMatch = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const cols = pkMatch[1].split(",").map((c) => stripQuotes(c.trim()));
        primaryKeyColumns.push(...cols);
      }
      continue;
    }

    if (
      (upper.startsWith("UNIQUE") && !upper.startsWith("UNIQUE KEY")) ||
      /^CONSTRAINT\s+\S+\s+UNIQUE/i.test(upper)
    ) {
      const uqMatch = trimmed.match(/UNIQUE\s*(?:KEY\s*(?:\S+\s*)?)?\(([^)]+)\)/i);
      if (uqMatch) {
        const cols = uqMatch[1].split(",").map((c) => stripQuotes(c.trim()));
        uniqueColumns.push(...cols);
      }
      continue;
    }

    if (upper.startsWith("UNIQUE KEY")) {
      const uqMatch = trimmed.match(/UNIQUE\s+KEY\s+\S+\s*\(([^)]+)\)/i);
      if (uqMatch) {
        const cols = uqMatch[1].split(",").map((c) => stripQuotes(c.trim()));
        uniqueColumns.push(...cols);
      }
      continue;
    }

    if (
      upper.startsWith("FOREIGN KEY") ||
      /^CONSTRAINT\s+\S+\s+FOREIGN\s+KEY/i.test(upper)
    ) {
      const fkMatch = trimmed.match(
        /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(`[^`]+`|"[^"]+"|[\w.]+)\s*\(([^)]+)\)/i,
      );
      if (fkMatch) {
        const fromCol = stripQuotes(fkMatch[1].trim());
        const refParts = fkMatch[2].split(".");
        const toTable = stripQuotes(refParts[refParts.length - 1]);
        const toCol = stripQuotes(fkMatch[3].trim());
        const { onDelete, onUpdate } = extractReferentialActions(trimmed);
        pendingFks.push({
          fromTable: tableName,
          fromColumn: fromCol,
          toTable,
          toColumn: toCol,
          onDelete,
          onUpdate,
        });
      }
      continue;
    }

    if (
      upper.startsWith("KEY ") ||
      upper.startsWith("INDEX ") ||
      upper.startsWith("CONSTRAINT")
    ) {
      continue;
    }

    const column = parseColumnDef(trimmed);
    if (column) {
      columns.push(column);
    }
  }

  for (const pkName of primaryKeyColumns) {
    const col = columns.find((c) => c.name.toLowerCase() === pkName.toLowerCase());
    if (col) {
      col.isPrimaryKey = true;
      col.isNullable = false;
      col.isUnique = true;
    }
  }

  for (const uqName of uniqueColumns) {
    const col = columns.find((c) => c.name.toLowerCase() === uqName.toLowerCase());
    if (col) {
      col.isUnique = true;
    }
  }

  const table: Table = {
    id: genId(),
    name: tableName,
    position: { x: 0, y: 0 },
    columns,
  };

  return { table, pendingFks };
}

function parseAlterTableFks(statement: string): PendingFk[] {
  const fks: PendingFk[] = [];

  const match = statement.match(/ALTER\s+TABLE\s+(`[^`]+`|"[^"]+"|[\w.]+)\s+([\s\S]+)/i);
  if (!match) return fks;

  const rawTableName = match[1];
  const nameParts = rawTableName.split(".");
  const tableName = stripQuotes(nameParts[nameParts.length - 1]);
  const body = match[2];

  const fkPattern =
    /ADD\s+(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|[\w]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(`[^`]+`|"[^"]+"|[\w.]+)\s*\(([^)]+)\)([^,;]*)/gi;

  let fkMatch;
  while ((fkMatch = fkPattern.exec(body)) !== null) {
    const fromCol = stripQuotes(fkMatch[1].trim());
    const refParts = fkMatch[2].split(".");
    const toTable = stripQuotes(refParts[refParts.length - 1]);
    const toCol = stripQuotes(fkMatch[3].trim());
    const rest = fkMatch[4] || "";
    const { onDelete, onUpdate } = extractReferentialActions(rest);
    fks.push({
      fromTable: tableName,
      fromColumn: fromCol,
      toTable,
      toColumn: toCol,
      onDelete,
      onUpdate,
    });
  }

  return fks;
}

function resolveForeignKeys(tables: Table[], pendingFks: PendingFk[]): Relation[] {
  const relations: Relation[] = [];

  for (const fk of pendingFks) {
    const fromTable = tables.find(
      (t) => t.name.toLowerCase() === fk.fromTable.toLowerCase(),
    );
    const toTable = tables.find((t) => t.name.toLowerCase() === fk.toTable.toLowerCase());
    if (!fromTable || !toTable) continue;

    const fromColumn = fromTable.columns.find(
      (c) => c.name.toLowerCase() === fk.fromColumn.toLowerCase(),
    );
    const toColumn = toTable.columns.find(
      (c) => c.name.toLowerCase() === fk.toColumn.toLowerCase(),
    );
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

export function parseSqlDdl(sql: string): SqlImportResult {
  const clean = stripComments(sql);
  const detectedDbType = detectDbType(clean);
  const statements = splitStatements(clean);

  const tables: Table[] = [];
  const allPendingFks: PendingFk[] = [];
  let attempted = 0;

  for (const stmt of statements) {
    const upper = stmt.toUpperCase().trim();

    if (upper.startsWith("CREATE TABLE") && !upper.startsWith("CREATE TEMPORARY TABLE")) {
      attempted++;
      const result = parseCreateTable(stmt);
      if (result) {
        tables.push(result.table);
        allPendingFks.push(...result.pendingFks);
      }
    } else if (upper.startsWith("ALTER TABLE")) {
      allPendingFks.push(...parseAlterTableFks(stmt));
    }
  }

  const relations = resolveForeignKeys(tables, allPendingFks);

  return { tables, relations, detectedDbType, attempted };
}

export interface AdaptResult {
  tables: Table[];
  adaptedCount: number;
}

export function adaptColumnsToDbType(tables: Table[], targetDbType: DbType): AdaptResult {
  const validTypes = new Set<string>(COLUMN_TYPES_BY_DB[targetDbType]);
  let adaptedCount = 0;

  const adapted = tables.map((table) => ({
    ...table,
    columns: table.columns.map((col) => {
      if (validTypes.has(col.type)) return col;
      adaptedCount++;
      return { ...col, type: "varchar" as ColumnType };
    }),
  }));

  return { tables: adapted, adaptedCount };
}
