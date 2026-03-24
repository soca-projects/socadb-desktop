import type { Table, Relation, DbType, ColumnType } from "../types/schema";
import { COLUMN_TYPES_BY_DB } from "../types/schema";
import {
  stripComments,
  splitStatements,
  detectDbType,
  parseCreateTable,
  parseAlterTableFks,
  resolveForeignKeys,
} from "./sqlParser";
import type { PendingFk } from "./sqlParser";

export { detectDbType } from "./sqlParser";

export interface SqlImportResult {
  tables: Table[];
  relations: Relation[];
  detectedDbType: DbType | null;
  attempted: number;
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
