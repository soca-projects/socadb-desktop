import { create } from "zustand";
import type { Table, Relation, Schema } from "../types/schema";

interface SchemaState {
  schema: Schema;
  setSchema: (schema: Schema) => void;
  addTable: (table: Table) => void;
  updateTable: (id: string, updates: Partial<Table>) => void;
  deleteTable: (id: string) => void;
  addRelation: (relation: Relation) => void;
  deleteRelation: (id: string) => void;
}

function createEmptySchema(): Schema {
  return {
    version: "1.0",
    name: "Untitled",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tables: [],
    relations: [],
  };
}

export const useSchemaStore = create<SchemaState>((set) => ({
  schema: createEmptySchema(),

  setSchema: (schema) => set({ schema }),

  addTable: (table) =>
    set((state) => ({
      schema: {
        ...state.schema,
        updatedAt: new Date().toISOString(),
        tables: [...state.schema.tables, table],
      },
    })),

  updateTable: (id, updates) =>
    set((state) => ({
      schema: {
        ...state.schema,
        updatedAt: new Date().toISOString(),
        tables: state.schema.tables.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      },
    })),

  deleteTable: (id) =>
    set((state) => ({
      schema: {
        ...state.schema,
        updatedAt: new Date().toISOString(),
        tables: state.schema.tables.filter((t) => t.id !== id),
        relations: state.schema.relations.filter(
          (r) => r.from.tableId !== id && r.to.tableId !== id
        ),
      },
    })),

  addRelation: (relation) =>
    set((state) => ({
      schema: {
        ...state.schema,
        updatedAt: new Date().toISOString(),
        relations: [...state.schema.relations, relation],
      },
    })),

  deleteRelation: (id) =>
    set((state) => ({
      schema: {
        ...state.schema,
        updatedAt: new Date().toISOString(),
        relations: state.schema.relations.filter((r) => r.id !== id),
      },
    })),
}));
