import type { Table, Relation, DbType, Column } from "../types/schema";
import { migrateSchema } from "./fileOperations";
import { genId } from "./id";
import { TableZ, RelationZ } from "./zodSchemas";

export interface JsonImportResult {
  tables: Table[];
  relations: Relation[];
  detectedDbType: DbType;
  attempted: number;
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

  const validTables = (data.tables as unknown[]).flatMap((t) => {
    const r = TableZ.safeParse(t);
    return r.success ? [r.data] : [];
  });

  const validRelations = (data.relations as unknown[]).flatMap((r) => {
    const result = RelationZ.safeParse(r);
    return result.success ? [result.data] : [];
  });

  const idMap = new Map<string, string>();

  const tables: Table[] = validTables.map((t) => {
    const newTableId = genId();
    idMap.set(t.id, newTableId);

    return {
      ...t,
      id: newTableId,
      position: t.position ?? { x: 0, y: 0 },
      columns: t.columns.map((c: Column) => {
        const newColId = genId();
        idMap.set(c.id, newColId);
        return {
          id: newColId,
          name: c.name,
          type: c.type,
          isPrimaryKey: c.isPrimaryKey,
          isForeignKey: c.isForeignKey,
          isNullable: c.isNullable,
          isUnique: c.isUnique,
          isAutoIncrement: c.isAutoIncrement,
          defaultValue: c.defaultValue,
        };
      }),
    };
  });

  const relations: Relation[] = validRelations
    .map((r) => {
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
    .filter((r): r is Relation => r !== null);

  return { tables, relations, detectedDbType: dbType, attempted: data.tables.length };
}
