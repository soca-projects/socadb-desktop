import { describe, it, expect, beforeEach } from "vitest";
import { useSchemaStore, createEmptySchema } from "./schemaStore";

function resetStore() {
  useSchemaStore.setState({
    schema: createEmptySchema("test", "postgresql"),
    filePath: null,
    savedAt: null,
  });
}

function addTestTable() {
  useSchemaStore.getState().addTable({
    id: "t1",
    name: "users",
    position: { x: 0, y: 0 },
    columns: [
      {
        id: "c1",
        name: "id",
        type: "uuid",
        isPrimaryKey: true,
        isForeignKey: false,
        isNullable: false,
        isUnique: true,
        isAutoIncrement: false,
        defaultValue: null,
      },
      {
        id: "c2",
        name: "email",
        type: "varchar",
        isPrimaryKey: false,
        isForeignKey: false,
        isNullable: false,
        isUnique: true,
        isAutoIncrement: false,
        defaultValue: null,
      },
    ],
  });
}

describe("createEmptySchema", () => {
  it("creates schema with defaults", () => {
    const schema = createEmptySchema();
    expect(schema.name).toBe("Untitled");
    expect(schema.dbType).toBe("postgresql");
    expect(schema.tables).toHaveLength(0);
    expect(schema.relations).toHaveLength(0);
  });

  it("accepts custom name and dbType", () => {
    const schema = createEmptySchema("mydb", "mysql");
    expect(schema.name).toBe("mydb");
    expect(schema.dbType).toBe("mysql");
  });
});

describe("schemaStore", () => {
  beforeEach(resetStore);

  describe("addTable", () => {
    it("adds a table", () => {
      addTestTable();
      const { schema } = useSchemaStore.getState();
      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].name).toBe("users");
    });

    it("updates the updatedAt timestamp", () => {
      const before = useSchemaStore.getState().schema.updatedAt;
      addTestTable();
      const after = useSchemaStore.getState().schema.updatedAt;
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime(),
      );
    });
  });

  describe("updateTable", () => {
    it("renames a table", () => {
      addTestTable();
      useSchemaStore.getState().updateTable("t1", { name: "accounts" });
      expect(useSchemaStore.getState().schema.tables[0].name).toBe("accounts");
    });
  });

  describe("deleteTable", () => {
    it("removes a table", () => {
      addTestTable();
      useSchemaStore.getState().deleteTable("t1");
      expect(useSchemaStore.getState().schema.tables).toHaveLength(0);
    });

    it("removes related relations", () => {
      addTestTable();
      useSchemaStore.getState().addTable({
        id: "t2",
        name: "posts",
        position: { x: 100, y: 0 },
        columns: [
          {
            id: "c3",
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
      });
      useSchemaStore.getState().addRelation({
        id: "r1",
        from: { tableId: "t2", columnId: "c3" },
        to: { tableId: "t1", columnId: "c1" },
        type: "N:1",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      useSchemaStore.getState().deleteTable("t1");
      expect(useSchemaStore.getState().schema.relations).toHaveLength(0);
    });
  });

  describe("addColumn", () => {
    it("adds a column to a table", () => {
      addTestTable();
      useSchemaStore.getState().addColumn("t1", {
        id: "c3",
        name: "age",
        type: "integer",
        isPrimaryKey: false,
        isForeignKey: false,
        isNullable: true,
        isUnique: false,
        isAutoIncrement: false,
        defaultValue: null,
      });
      expect(useSchemaStore.getState().schema.tables[0].columns).toHaveLength(3);
    });
  });

  describe("updateColumn", () => {
    it("updates column properties", () => {
      addTestTable();
      useSchemaStore.getState().updateColumn("t1", "c2", { isUnique: false });
      const col = useSchemaStore
        .getState()
        .schema.tables[0].columns.find((c) => c.id === "c2");
      expect(col).toBeDefined();
      if (!col) return;
      expect(col.isUnique).toBe(false);
    });
  });

  describe("deleteColumn", () => {
    it("removes a column", () => {
      addTestTable();
      useSchemaStore.getState().deleteColumn("t1", "c2");
      expect(useSchemaStore.getState().schema.tables[0].columns).toHaveLength(1);
    });

    it("removes relations referencing the column", () => {
      addTestTable();
      useSchemaStore.getState().addTable({
        id: "t2",
        name: "posts",
        position: { x: 100, y: 0 },
        columns: [
          {
            id: "c3",
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
      });
      useSchemaStore.getState().addRelation({
        id: "r1",
        from: { tableId: "t2", columnId: "c3" },
        to: { tableId: "t1", columnId: "c1" },
        type: "N:1",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      useSchemaStore.getState().deleteColumn("t1", "c1");
      expect(useSchemaStore.getState().schema.relations).toHaveLength(0);
    });
  });

  describe("addRelation / deleteRelation", () => {
    it("adds and removes a relation", () => {
      addTestTable();
      useSchemaStore.getState().addRelation({
        id: "r1",
        from: { tableId: "t1", columnId: "c1" },
        to: { tableId: "t1", columnId: "c2" },
        type: "1:1",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
      expect(useSchemaStore.getState().schema.relations).toHaveLength(1);

      useSchemaStore.getState().deleteRelation("r1");
      expect(useSchemaStore.getState().schema.relations).toHaveLength(0);
    });
  });

  describe("importTables", () => {
    it("merges tables and relations", () => {
      addTestTable();
      useSchemaStore.getState().importTables(
        [
          {
            id: "t2",
            name: "posts",
            position: { x: 100, y: 0 },
            columns: [],
          },
        ],
        [],
      );
      expect(useSchemaStore.getState().schema.tables).toHaveLength(2);
    });
  });
});
