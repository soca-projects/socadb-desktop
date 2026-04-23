import { create } from "zustand";
import { temporal } from "zundo";
import type { Column, Table, Relation, Schema, DbType } from "../types/schema";

interface SchemaState {
  schema: Schema;
  filePath: string | null;
  savedAt: string | null;
  setSchema: (schema: Schema) => void;
  setFilePath: (path: string | null) => void;
  markSaved: () => void;
  addTable: (table: Table) => void;
  updateTable: (id: string, updates: Partial<Table>) => void;
  updateTablePositions: (positions: Record<string, { x: number; y: number }>) => void;
  deleteTable: (id: string) => void;
  addColumn: (tableId: string, column: Column) => void;
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  addRelation: (relation: Relation) => void;
  updateRelation: (id: string, updates: Partial<Relation>) => void;
  deleteRelation: (id: string) => void;
  importTables: (tables: Table[], relations: Relation[]) => void;
}

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
  return { ...schema, ...patch, updatedAt: new Date().toISOString() };
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

      addTable: (table) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: [...state.schema.tables, table],
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

      importTables: (tables, relations) =>
        set((state) => ({
          schema: patchSchema(state.schema, {
            tables: [...state.schema.tables, ...tables],
            relations: [...state.schema.relations, ...relations],
          }),
        })),
    }),
    {
      partialize: ({ schema }) => ({ schema }),
      limit: 50,
    },
  ),
);
