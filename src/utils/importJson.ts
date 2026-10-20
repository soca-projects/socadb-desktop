import type { Table, Relation, DbType, SchemaEnum } from "../types/schema";
import { migrateSchema } from "./fileOperations";
import { genId } from "./id";
import { linkEnumColumns, pruneColumnFields, pruneIndexes } from "./schemaIntegrity";
import { TableZ, RelationZ, SchemaEnumZ } from "./zodSchemas";
import i18next from "../i18n";

export interface JsonImportResult {
  tables: Table[];
  relations: Relation[];
  enums: SchemaEnum[];
  detectedDbType: DbType;
  attempted: number;
}

export function parseJsonSchema(json: string): JsonImportResult {
  const data = JSON.parse(json);

  if (!data.tables || !Array.isArray(data.tables)) {
    throw new Error(i18next.t("toast.invalidFile"));
  }
  if (!data.relations || !Array.isArray(data.relations)) {
    throw new Error(i18next.t("toast.invalidFile"));
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

  const enumIds = new Map<string, string>();
  const enums: SchemaEnum[] = (
    Array.isArray(data.enums) ? (data.enums as unknown[]) : []
  ).flatMap((e) => {
    const r = SchemaEnumZ.safeParse(e);
    if (!r.success) return [];
    const id = genId();
    enumIds.set(r.data.id, id);
    return [{ ...r.data, id }];
  });

  const idMap = new Map<string, string>();

  const imported: Table[] = validTables.map((t) => {
    const newTableId = genId();
    idMap.set(t.id, newTableId);
    const columns = t.columns.map((c) => {
      const newColId = genId();
      idMap.set(c.id, newColId);
      return { ...c, id: newColId, enumId: c.enumId ? enumIds.get(c.enumId) : undefined };
    });
    const indexes = t.indexes?.map((i) => ({
      ...i,
      id: genId(),
      columnIds: i.columnIds.flatMap((id) => {
        const mapped = idMap.get(id);
        return mapped ? [mapped] : [];
      }),
    }));
    return {
      ...t,
      id: newTableId,
      position: t.position ?? { x: 0, y: 0 },
      columns,
      ...(indexes ? { indexes } : {}),
    };
  });

  const linked = linkEnumColumns(
    pruneColumnFields(pruneIndexes(imported), dbType),
    enums,
  );

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

  return {
    tables: linked.tables,
    relations,
    enums: linked.enums,
    detectedDbType: dbType,
    attempted: data.tables.length,
  };
}
