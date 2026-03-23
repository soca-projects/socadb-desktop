import { describe, it, expect } from "vitest";
import {
  findTableById,
  findColumnById,
  findTableByName,
  findColumnByName,
  getRelationsFromTable,
  serializeColumn,
  serializeRelation,
} from "./schemaQueries";
import type { Schema, Table, Column, Relation } from "../types/schema";

const col1: Column = {
  id: "c1",
  name: "id",
  type: "uuid",
  isPrimaryKey: true,
  isForeignKey: false,
  isNullable: false,
  isUnique: true,
  isAutoIncrement: false,
  defaultValue: "gen_random_uuid()",
};

const col2: Column = {
  id: "c2",
  name: "email",
  type: "varchar",
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: false,
  isUnique: true,
  isAutoIncrement: false,
  defaultValue: null,
};

const table1: Table = {
  id: "t1",
  name: "users",
  position: { x: 0, y: 0 },
  columns: [col1, col2],
};

const table2: Table = {
  id: "t2",
  name: "posts",
  position: { x: 100, y: 0 },
  columns: [
    { ...col1, id: "c3", name: "id" },
    {
      id: "c4",
      name: "user_id",
      type: "uuid",
      isPrimaryKey: false,
      isForeignKey: true,
      isNullable: false,
      isUnique: false,
      isAutoIncrement: false,
      defaultValue: null,
    },
  ],
};

const relation: Relation = {
  id: "r1",
  from: { tableId: "t2", columnId: "c4" },
  to: { tableId: "t1", columnId: "c1" },
  type: "N:1",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
};

const schema: Schema = {
  version: "1.0",
  name: "test",
  dbType: "postgresql",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  tables: [table1, table2],
  relations: [relation],
};

describe("findTableById", () => {
  it("finds existing table", () => {
    expect(findTableById(schema, "t1")).toBe(table1);
  });

  it("returns undefined for missing id", () => {
    expect(findTableById(schema, "unknown")).toBeUndefined();
  });
});

describe("findColumnById", () => {
  it("finds existing column", () => {
    expect(findColumnById(table1, "c1")).toBe(col1);
  });

  it("returns undefined for missing id", () => {
    expect(findColumnById(table1, "unknown")).toBeUndefined();
  });
});

describe("findTableByName", () => {
  it("finds existing table", () => {
    expect(findTableByName(schema, "users")).toBe(table1);
  });

  it("returns undefined for missing name", () => {
    expect(findTableByName(schema, "unknown")).toBeUndefined();
  });
});

describe("findColumnByName", () => {
  it("finds existing column", () => {
    expect(findColumnByName(table1, "email")).toBe(col2);
  });

  it("returns undefined for missing name", () => {
    expect(findColumnByName(table1, "unknown")).toBeUndefined();
  });
});

describe("getRelationsFromTable", () => {
  it("returns outbound relations", () => {
    const rels = getRelationsFromTable(schema, "t2");
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe("r1");
  });

  it("returns empty for table with no outbound relations", () => {
    expect(getRelationsFromTable(schema, "t1")).toHaveLength(0);
  });
});

describe("serializeColumn", () => {
  it("strips internal id", () => {
    const serialized = serializeColumn(col1);
    expect(serialized).not.toHaveProperty("id");
    expect(serialized.name).toBe("id");
    expect(serialized.type).toBe("uuid");
    expect(serialized.isPrimaryKey).toBe(true);
  });
});

describe("serializeRelation", () => {
  it("resolves table/column ids to names", () => {
    const serialized = serializeRelation(schema, relation);
    expect(serialized.type).toBe("N:1");
    expect(serialized.from).toEqual({ table: "posts", column: "user_id" });
    expect(serialized.to).toEqual({ table: "users", column: "id" });
  });

  it("returns undefined names for missing references", () => {
    const badRelation: Relation = {
      ...relation,
      from: { tableId: "missing", columnId: "missing" },
    };
    const serialized = serializeRelation(schema, badRelation);
    expect(serialized.from.table).toBeUndefined();
    expect(serialized.from.column).toBeUndefined();
  });
});
