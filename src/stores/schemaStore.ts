import { create } from "zustand";
import { temporal } from "zundo";
import type {
  Column,
  Table,
  Relation,
  Schema,
  DbType,
  SchemaEnum,
  TableIndex,
} from "../types/schema";
import { genId } from "../utils/id";
import { findColumnById, findTableById } from "../utils/schemaQueries";
import {
  normalizeSchema,
  renameEnumsAgainst,
  uniqueEnumName,
} from "../utils/schemaIntegrity";

interface SchemaState {
  schema: Schema;
  filePath: string | null;
  savedAt: string | null;
  setSchema: (schema: Schema) => void;
  setFilePath: (path: string | null) => void;
  markSaved: () => void;
  updateTable: (id: string, updates: Partial<Table>) => void;
  updateTablePositions: (positions: Record<string, { x: number; y: number }>) => void;
  deleteTable: (id: string) => void;
  addColumn: (tableId: string, column: Column) => void;
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  addRelation: (relation: Relation) => void;
  updateRelation: (id: string, updates: Partial<Relation>) => void;
  deleteRelation: (id: string) => void;
  addTable: (table: Table, enums?: SchemaEnum[]) => void;
  createEnumForColumn: (tableId: string, columnId: string, values: string[]) => string;
  updateEnum: (id: string, updates: Partial<Omit<SchemaEnum, "id">>) => void;
  addIndex: (tableId: string, index: TableIndex) => void;
  updateIndex: (
    tableId: string,
    indexId: string,
    updates: Partial<Omit<TableIndex, "id">>,
  ) => void;
  deleteIndex: (tableId: string, indexId: string) => void;
  importTables: (tables: Table[], relations: Relation[], enums?: SchemaEnum[]) => void;
}

export const UNDO_LIMIT = 50;

export function createEmptySchema(
  name = "Untitled",
  dbType: DbType = "postgresql",
): Schema {
  return {
    version: "1.0",
    name,
    dbType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tables: [],
    relations: [],
  };
}

function patchSchema(schema: Schema, patch: Partial<Schema>): Schema {
  return normalizeSchema(
    { ...schema, ...patch, updatedAt: new Date().toISOString() },
    schema,
  );
}

function mapTable(tables: Table[], id: string, fn: (t: Table) => Table): Table[] {
  return tables.map((t) => (t.id === id ? fn(t) : t));
}

export const useSchemaStore = create<SchemaState>()(
  temporal(
    (set) => ({
      schema: createEmptySchema(),
      filePath: null,
      savedAt: null,

      setSchema: (schema) => set({ schema, savedAt: schema.updatedAt }),
      setFilePath: (path) => set({ filePath: path }),
      markSaved: () => set((state) => ({ savedAt: state.schema.updatedAt })),

      addTable: (table, enums = []) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: [...state.schema.tables, table],
            ...(enums.length ? { enums: [...(state.schema.enums ?? []), ...enums] } : {}),
          }),
        })),

      updateTable: (id, updates) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.map((t) =>
              t.id === id ? { ...t, ...updates } : t,
            ),
          }),
        })),

      updateTablePositions: (positions) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.map((t) =>
              positions[t.id] ? { ...t, position: positions[t.id] } : t,
            ),
          }),
        })),

      deleteTable: (id) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.filter((t) => t.id !== id),
            relations: state.schema.relations.filter(
              (r) => r.from.tableId !== id && r.to.tableId !== id,
            ),
          }),
        })),

      addColumn: (tableId, column) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.map((t) =>
              t.id === tableId ? { ...t, columns: [...t.columns, column] } : t,
            ),
          }),
        })),

      updateColumn: (tableId, columnId, updates) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    columns: t.columns.map((c) =>
                      c.id === columnId ? { ...c, ...updates } : c,
                    ),
                  }
                : t,
            ),
          }),
        })),

      deleteColumn: (tableId, columnId) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    columns: t.columns.filter((c) => c.id !== columnId),
                  }
                : t,
            ),
            relations: state.schema.relations.filter(
              (r) =>
                !(r.from.tableId === tableId && r.from.columnId === columnId) &&
                !(r.to.tableId === tableId && r.to.columnId === columnId),
            ),
          }),
        })),

      createEnumForColumn: (tableId, columnId, values) => {
        const id = genId();
        set((state) => {
          const table = findTableById(state.schema, tableId);
          const column = table && findColumnById(table, columnId);
          if (!table || !column) return state;
          const enums = state.schema.enums ?? [];
          const created: SchemaEnum = {
            id,
            name: uniqueEnumName(
              `${table.name}_${column.name}`,
              enums,
              state.schema.tables.map((x) => x.name),
            ),
            values,
          };
          const keepDefault =
            column.defaultValue !== null && values.includes(column.defaultValue);
          return {
            schema: patchSchema(state.schema, {
              enums: [...enums, created],
              tables: mapTable(state.schema.tables, tableId, (t) => ({
                ...t,
                columns: t.columns.map(
                  (c): Column =>
                    c.id === columnId
                      ? {
                          ...c,
                          type: "enum",
                          enumId: id,
                          isAutoIncrement: false,
                          defaultValue: keepDefault ? c.defaultValue : null,
                        }
                      : c,
                ),
              })),
            }),
          };
        });
        return id;
      },

      updateEnum: (id, updates) =>
        set((state) => {
          const values = updates.values;
          const stale = (c: Column) =>
            values !== undefined &&
            c.enumId === id &&
            c.defaultValue !== null &&
            !values.includes(c.defaultValue);
          const touched = state.schema.tables.some((t) => t.columns.some(stale));
          return {
            schema: patchSchema(state.schema, {
              enums: (state.schema.enums ?? []).map((e) =>
                e.id === id ? { ...e, ...updates } : e,
              ),
              ...(touched
                ? {
                    tables: state.schema.tables.map((t) =>
                      t.columns.some(stale)
                        ? {
                            ...t,
                            columns: t.columns.map((c) =>
                              stale(c) ? { ...c, defaultValue: null } : c,
                            ),
                          }
                        : t,
                    ),
                  }
                : {}),
            }),
          };
        }),

      addIndex: (tableId, index) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: mapTable(state.schema.tables, tableId, (t) => ({
              ...t,
              indexes: [...(t.indexes ?? []), index],
            })),
          }),
        })),

      updateIndex: (tableId, indexId, updates) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: mapTable(state.schema.tables, tableId, (t) => ({
              ...t,
              indexes: (t.indexes ?? []).map((i) =>
                i.id === indexId ? { ...i, ...updates } : i,
              ),
            })),
          }),
        })),

      deleteIndex: (tableId, indexId) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: mapTable(state.schema.tables, tableId, (t) => ({
              ...t,
              indexes: (t.indexes ?? []).filter((i) => i.id !== indexId),
            })),
          }),
        })),

      addRelation: (relation) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: state.schema.tables.map((t) =>
              t.id === relation.from.tableId
                ? {
                    ...t,
                    columns: t.columns.map((c) =>
                      c.id === relation.from.columnId ? { ...c, isForeignKey: true } : c,
                    ),
                  }
                : t,
            ),
            relations: [...state.schema.relations, relation],
          }),
        })),

      updateRelation: (id, updates) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            relations: state.schema.relations.map((r) =>
              r.id === id ? { ...r, ...updates } : r,
            ),
          }),
        })),

      deleteRelation: (id) =>
        set((state) => {
          const relation = state.schema.relations.find((r) => r.id === id);
          const remaining = state.schema.relations.filter((r) => r.id !== id);
          const stillFk =
            relation &&
            remaining.some(
              (r) =>
                r.from.tableId === relation.from.tableId &&
                r.from.columnId === relation.from.columnId,
            );
          return {
            schema: patchSchema(state.schema, {
              tables:
                relation && !stillFk
                  ? state.schema.tables.map((t) =>
                      t.id === relation.from.tableId
                        ? {
                            ...t,
                            columns: t.columns.map((c) =>
                              c.id === relation.from.columnId
                                ? { ...c, isForeignKey: false }
                                : c,
                            ),
                          }
                        : t,
                    )
                  : state.schema.tables,
              relations: remaining,
            }),
          };
        }),

      importTables: (tables, relations, enums = []) =>
        set((state) => {
          const current = state.schema.enums ?? [];
          return {
            schema: patchSchema(state.schema, {
              tables: [...state.schema.tables, ...tables],
              relations: [...state.schema.relations, ...relations],
              ...(enums.length
                ? {
                    enums: [
                      ...current,
                      ...renameEnumsAgainst(
                        current,
                        enums,
                        [...state.schema.tables, ...tables].map((x) => x.name),
                      ),
                    ],
                  }
                : {}),
            }),
          };
        }),
    }),
    {
      partialize: ({ schema }) => ({ schema }),
      limit: UNDO_LIMIT,
    },
  ),
);
