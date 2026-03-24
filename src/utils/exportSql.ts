import { save, message } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useSchemaStore } from "../stores/schemaStore";
import type { Schema, Table, Column } from "../types/schema";
import { findTableById, findColumnById, getRelationsFromTable } from "./schemaQueries";

// --- MySQL DDL ---

function mysqlColumnDef(col: Column): string {
  let def = `  \`${col.name}\` ${mysqlType(col)}`;
  if (!col.isNullable) def += " NOT NULL";
  if (col.isAutoIncrement) {
    def += " AUTO_INCREMENT";
  } else if (col.defaultValue) {
    def += ` DEFAULT ${col.defaultValue}`;
  }
  return def;
}

function mysqlType(col: Column): string {
  switch (col.type) {
    case "boolean":
      return "TINYINT(1)";
    case "varchar":
      return "VARCHAR(255)";
    case "char":
      return "CHAR(255)";
    default:
      return col.type.toUpperCase();
  }
}

function generateMysqlTable(schema: Schema, table: Table): string {
  const lines: string[] = [];

  lines.push(`CREATE TABLE \`${table.name}\` (`);

  const defs: string[] = table.columns.map(mysqlColumnDef);

  const pks = table.columns.filter((c) => c.isPrimaryKey);
  if (pks.length > 0) {
    defs.push(`  PRIMARY KEY (${pks.map((c) => `\`${c.name}\``).join(", ")})`);
  }

  const uniques = table.columns.filter((c) => c.isUnique && !c.isPrimaryKey);
  for (const col of uniques) {
    defs.push(`  UNIQUE KEY \`uk_${table.name}_${col.name}\` (\`${col.name}\`)`);
  }

  const fks = getRelationsFromTable(schema, table.id);
  for (const rel of fks) {
    const fromCol = findColumnById(table, rel.from.columnId);
    const toTable = findTableById(schema, rel.to.tableId);
    const toCol = toTable ? findColumnById(toTable, rel.to.columnId) : undefined;
    if (fromCol && toTable && toCol) {
      defs.push(
        `  CONSTRAINT \`fk_${table.name}_${fromCol.name}\` FOREIGN KEY (\`${fromCol.name}\`) REFERENCES \`${toTable.name}\` (\`${toCol.name}\`) ON DELETE ${rel.onDelete} ON UPDATE ${rel.onUpdate}`,
      );
    }
  }

  lines.push(defs.join(",\n"));
  lines.push(") ENGINE=InnoDB;");

  return lines.join("\n");
}

export function generateMysqlDdl(schema: Schema): string {
  return schema.tables.map((t) => generateMysqlTable(schema, t)).join("\n\n");
}

// --- PostgreSQL DDL ---

function postgresqlColumnDef(col: Column): string {
  let def = `  "${col.name}" ${postgresqlType(col)}`;
  if (!col.isNullable) def += " NOT NULL";
  if (col.defaultValue) {
    def += ` DEFAULT ${col.defaultValue}`;
  }
  return def;
}

function postgresqlType(col: Column): string {
  switch (col.type) {
    case "varchar":
      return "VARCHAR(255)";
    case "char":
      return "CHAR(255)";
    case "double precision":
      return "DOUBLE PRECISION";
    default:
      return col.type.toUpperCase();
  }
}

function generatePostgresqlTable(table: Table): string {
  const lines: string[] = [];

  lines.push(`CREATE TABLE "${table.name}" (`);

  const defs: string[] = table.columns.map(postgresqlColumnDef);

  const pks = table.columns.filter((c) => c.isPrimaryKey);
  if (pks.length > 0) {
    defs.push(`  PRIMARY KEY (${pks.map((c) => `"${c.name}"`).join(", ")})`);
  }

  const uniques = table.columns.filter((c) => c.isUnique && !c.isPrimaryKey);
  for (const col of uniques) {
    defs.push(`  CONSTRAINT "uk_${table.name}_${col.name}" UNIQUE ("${col.name}")`);
  }

  lines.push(defs.join(",\n"));
  lines.push(");");

  return lines.join("\n");
}

function generatePostgresqlForeignKeys(schema: Schema): string {
  const fks: string[] = [];

  for (const table of schema.tables) {
    for (const rel of getRelationsFromTable(schema, table.id)) {
      const fromCol = findColumnById(table, rel.from.columnId);
      const toTable = findTableById(schema, rel.to.tableId);
      const toCol = toTable ? findColumnById(toTable, rel.to.columnId) : undefined;
      if (fromCol && toTable && toCol) {
        fks.push(
          `ALTER TABLE "${table.name}" ADD CONSTRAINT "fk_${table.name}_${fromCol.name}" FOREIGN KEY ("${fromCol.name}") REFERENCES "${toTable.name}" ("${toCol.name}") ON DELETE ${rel.onDelete} ON UPDATE ${rel.onUpdate};`,
        );
      }
    }
  }

  return fks.join("\n");
}

export function generatePostgresqlDdl(schema: Schema): string {
  const tables = schema.tables.map((t) => generatePostgresqlTable(t)).join("\n\n");
  const fks = generatePostgresqlForeignKeys(schema);
  return fks ? `${tables}\n\n${fks}` : tables;
}

// --- Export ---

export async function exportSql() {
  try {
    const { schema } = useSchemaStore.getState();
    const schemaName = schema.name || "schema";

    const ddl =
      schema.dbType === "mysql"
        ? generateMysqlDdl(schema)
        : generatePostgresqlDdl(schema);

    const path = await save({
      defaultPath: `${schemaName}.sql`,
      filters: [{ name: "SQL File", extensions: ["sql"] }],
    });
    if (!path) return;

    await writeTextFile(path, ddl);
  } catch (e) {
    await message(`Failed to export SQL: ${e}`, { title: "Export Error", kind: "error" });
  }
}
