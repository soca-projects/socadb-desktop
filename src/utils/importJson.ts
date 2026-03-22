import type { Table, Relation, DbType, Column } from "../types/schema";
import { migrateSchema } from "./fileOperations";
import { genId } from "./id";

export interface JsonImportResult {
  tables: Table[];
  relations: Relation[];
  detectedDbType: DbType;
  attempted: number;
}

function isValidColumn(c: unknown): c is Column {
  if (!c || typeof c !== "object") return false;
  const col = c as Record<string, unknown>;
  return (
    typeof col.id === "string" &&
    typeof col.name === "string" &&
    typeof col.type === "string"
  );
}

function isValidTable(t: unknown): t is Table {
  if (!t || typeof t !== "object") return false;
  const table = t as Record<string, unknown>;
  return (
    typeof table.id === "string" &&
    typeof table.name === "string" &&
    Array.isArray(table.columns) &&
    table.columns.every(isValidColumn)
  );
}

function isValidRelation(r: unknown): r is Relation {
  if (!r || typeof r !== "object") return false;
  const rel = r as Record<string, unknown>;
  const from = rel.from as Record<string, unknown> | undefined;
  const to = rel.to as Record<string, unknown> | undefined;
  return (
    typeof rel.id === "string" &&
    !!from &&
    typeof from.tableId === "string" &&
    typeof from.columnId === "string" &&
    !!to &&
    typeof to.tableId === "string" &&
    typeof to.columnId === "string"
  );
}

export function parseJsonSchema(json: string): JsonImportResult {
  const data = JSON.parse(json);

  if (!data.tables || !Array.isArray(data.tables)) {
    throw new Error("Invalid JSON: missing 'tables' array");
  }
  if (!data.relations || !Array.isArray(data.relations)) {
    throw new Error("Invalid JSON: missing 'relations' array");
  }

  migrateSchema(data);

  const dbType: DbType = data.dbType === "mysql" ? "mysql" : "postgresql";

  const validTables = data.tables.filter(isValidTable);
  const validRelations = data.relations.filter(isValidRelation);

  const idMap = new Map<string, string>();

  const tables: Table[] = validTables.map((t: Table) => {
    const newTableId = genId();
    idMap.set(t.id, newTableId);

    return {
      ...t,
      id: newTableId,
      position: t.position ?? { x: 0, y: 0 },
      columns: t.columns.map(
        (c: Partial<Column> & Pick<Column, "id" | "name" | "type">) => {
          const newColId = genId();
          idMap.set(c.id, newColId);
          return {
            id: newColId,
            name: c.name,
            type: c.type,
            isPrimaryKey: c.isPrimaryKey ?? false,
            isForeignKey: c.isForeignKey ?? false,
            isNullable: c.isNullable ?? true,
            isUnique: c.isUnique ?? false,
            isAutoIncrement: c.isAutoIncrement ?? false,
            defaultValue: c.defaultValue ?? null,
          };
        },
      ),
    };
  });

  const relations: Relation[] = validRelations
    .map((r: Relation) => {
      const fromTableId = idMap.get(r.from.tableId);
      const fromColumnId = idMap.get(r.from.columnId);
      const toTableId = idMap.get(r.to.tableId);
      const toColumnId = idMap.get(r.to.columnId);

      if (!fromTableId || !fromColumnId || !toTableId || !toColumnId) return null;

      return {
        ...r,
        id: genId(),
        from: { tableId: fromTableId, columnId: fromColumnId },
        to: { tableId: toTableId, columnId: toColumnId },
      };
    })
    .filter((r: Relation | null): r is Relation => r !== null);

  return { tables, relations, detectedDbType: dbType, attempted: data.tables.length };
}
