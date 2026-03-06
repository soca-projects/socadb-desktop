import { create } from "zustand";
import type { Column, Table, Relation, Schema } from "../types/schema";

interface SchemaState {
  schema: Schema;
  filePath: string | null;
  setSchema: (schema: Schema) => void;
  setFilePath: (path: string | null) => void;
  addTable: (table: Table) => void;
  updateTable: (id: string, updates: Partial<Table>) => void;
  deleteTable: (id: string) => void;
  addColumn: (tableId: string, column: Column) => void;
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  addRelation: (relation: Relation) => void;
  deleteRelation: (id: string) => void;
}

export function createEmptySchema(): Schema {
  return {
    version: "1.0",
    name: "Untitled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tables: [],
    relations: [],
  };
}

function patchSchema(schema: Schema, patch: Partial<Schema>): Schema {
  return { ...schema, ...patch, updatedAt: new Date().toISOString() };
}

export const useSchemaStore = create<SchemaState>((set) => ({
  schema: createEmptySchema(),
  filePath: null,

  setSchema: (schema) => set({ schema }),
  setFilePath: (path) => set({ filePath: path }),

  addTable: (table) =>
    set((state) => ({
      schema: patchSchema(state.schema, {
        tables: [...state.schema.tables, table],
      }),
    })),

  updateTable: (id, updates) =>
    set((state) => ({
      schema: patchSchema(state.schema, {
        tables: state.schema.tables.map((t) => (t.id === id ? { ...t, ...updates } : t)),
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
            ? { ...t, columns: t.columns.filter((c) => c.id !== columnId) }
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
        relations: [...state.schema.relations, relation],
      }),
    })),

  deleteRelation: (id) =>
    set((state) => ({
      schema: patchSchema(state.schema, {
        relations: state.schema.relations.filter((r) => r.id !== id),
      }),
    })),
}));
