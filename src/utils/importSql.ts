import type { Column, Table, Relation, DbType, SchemaEnum } from "../types/schema";
import { linkEnumColumns } from "./schemaIntegrity";
import { detectDbType, parseStatements } from "./sqlParser";
import type { ImportIssue } from "./sqlColumns";
import { splitStatements, stripComments } from "./sqlScan";
import { dialectType } from "./sqlTypes";

export interface SqlImportResult {
  tables: Table[];
  relations: Relation[];
  detectedDbType: DbType | null;
  attempted: number;
  enums: SchemaEnum[];
  issues: ImportIssue[];
}

// Quotes and escapes depend on the dialect, so a file nothing marks as MySQL or
// PostgreSQL is read as the schema it goes into.
export function parseSqlDdl(
  sql: string,
  fallbackDbType: DbType | null = null,
): SqlImportResult {
  const detectedDbType = detectDbType(sql);
  const dialect = detectedDbType ?? fallbackDbType;
  const parsed = parseStatements(
    splitStatements(stripComments(sql, dialect), dialect),
    dialect,
  );
  const linked = linkEnumColumns(parsed.tables, parsed.enums);
  return {
    tables: linked.tables,
    relations: parsed.relations,
    enums: linked.enums,
    detectedDbType,
    attempted: parsed.attempted,
    issues: parsed.issues,
  };
}

export interface AdaptResult {
  tables: Table[];
  adaptedCount: number;
}

export function adaptColumnsToDbType(tables: Table[], targetDbType: DbType): AdaptResult {
  let adaptedCount = 0;

  const adapted = tables.map((table) => ({
    ...table,
    columns: table.columns.map((col): Column => {
      const type = dialectType(col.type, targetDbType);
      if (type === col.type) return col;
      if (type) {
        const serial = col.type === "serial" || col.type === "bigserial";
        return serial ? { ...col, type, isAutoIncrement: true } : { ...col, type };
      }
      adaptedCount++;
      return { ...col, type: "varchar" };
    }),
  }));

  return { tables: adapted, adaptedCount };
}
