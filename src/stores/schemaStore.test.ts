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
  describe("enums", () => {
    beforeEach(addTestTable);

    function addRole(defaultValue: string | null = "reader") {
      useSchemaStore.getState().addColumn("t1", {
        id: "c3",
        name: "role",
        type: "varchar",
        isPrimaryKey: false,
        isForeignKey: false,
        isNullable: false,
        isUnique: false,
        isAutoIncrement: false,
        defaultValue,
      });
    }
    const column = (id: string) =>
      useSchemaStore.getState().schema.tables[0].columns.find((c) => c.id === id);

    it("turns a column into a new enum, keeping a default that is in the list", () => {
      addRole();
      const id = useSchemaStore
        .getState()
        .createEnumForColumn("t1", "c3", ["reader", "librarian"]);
      const { enums } = useSchemaStore.getState().schema;
      expect(enums).toEqual([
        { id, name: "users_role", values: ["reader", "librarian"] },
      ]);
      expect(column("c3")).toMatchObject({
        type: "enum",
        enumId: id,
        defaultValue: "reader",
      });
    });

    it("clears a default that is not in the new list", () => {
      addRole("guest");
      useSchemaStore.getState().createEnumForColumn("t1", "c3", ["reader"]);
      expect(column("c3")?.defaultValue).toBeNull();
    });

    it("removes the enum when its only column goes back to text", () => {
      addRole();
      useSchemaStore.getState().createEnumForColumn("t1", "c3", ["reader"]);
      useSchemaStore.getState().updateColumn("t1", "c3", { type: "varchar" });
      expect(useSchemaStore.getState().schema.enums).toEqual([]);
      expect(column("c3")).not.toHaveProperty("enumId");
    });

    it("keeps a shared enum while another column uses it", () => {
      addRole();
      const id = useSchemaStore.getState().createEnumForColumn("t1", "c3", ["reader"]);
      useSchemaStore.getState().updateColumn("t1", "c2", { type: "enum", enumId: id });
      useSchemaStore.getState().updateColumn("t1", "c3", { type: "varchar" });
      expect(useSchemaStore.getState().schema.enums?.map((e) => e.id)).toEqual([id]);
    });

    it("gives an empty enum to a column set to enum without one", () => {
      addRole();
      useSchemaStore.getState().updateColumn("t1", "c3", { type: "enum" });
      const enums = useSchemaStore.getState().schema.enums ?? [];
      expect(enums).toHaveLength(1);
      expect(column("c3")?.enumId).toBe(enums[0].id);
    });

    it("clears defaults that use a value removed from the enum", () => {
      addRole();
      const id = useSchemaStore
        .getState()
        .createEnumForColumn("t1", "c3", ["reader", "librarian"]);
      useSchemaStore.getState().updateEnum(id, { values: ["librarian"] });
      expect(column("c3")?.defaultValue).toBeNull();
    });

    it("renames an enum", () => {
      addRole();
      const id = useSchemaStore.getState().createEnumForColumn("t1", "c3", ["reader"]);
      useSchemaStore.getState().updateEnum(id, { name: "member_role" });
      expect(useSchemaStore.getState().schema.enums?.[0].name).toBe("member_role");
    });

    it("keeps an enum that was already unused when an unrelated change happens", () => {
      const schema = useSchemaStore.getState().schema;
      useSchemaStore.getState().setSchema({
        ...schema,
        enums: [{ id: "e9", name: "orphan", values: ["a"] }],
      });
      useSchemaStore.getState().updateTable("t1", { name: "people" });
      expect(useSchemaStore.getState().schema.enums?.map((e) => e.id)).toEqual(["e9"]);
    });

    it("does not add an enums key to a schema that never had one", () => {
      useSchemaStore.getState().updateTable("t1", { name: "people" });
      expect(useSchemaStore.getState().schema).not.toHaveProperty("enums");
    });
  });

  describe("indexes", () => {
    beforeEach(addTestTable);

    const indexes = () => useSchemaStore.getState().schema.tables[0].indexes;

    it("adds, updates and deletes an index", () => {
      const { addIndex, updateIndex, deleteIndex } = useSchemaStore.getState();
      addIndex("t1", { id: "i1", columnIds: ["c2"], unique: false });
      updateIndex("t1", "i1", { unique: true, name: "users_email_key" });
      expect(indexes()).toEqual([
        { id: "i1", columnIds: ["c2"], unique: true, name: "users_email_key" },
      ]);
      deleteIndex("t1", "i1");
      expect(indexes()).toEqual([]);
    });

    it("removes a deleted column from its indexes and drops indexes left empty", () => {
      const { addIndex, deleteColumn } = useSchemaStore.getState();
      addIndex("t1", { id: "i1", columnIds: ["c1", "c2"], unique: false });
      addIndex("t1", { id: "i2", columnIds: ["c2"], unique: true });
      deleteColumn("t1", "c2");
      expect(indexes()).toEqual([{ id: "i1", columnIds: ["c1"], unique: false }]);
    });
  });

  describe("type parameters", () => {
    beforeEach(addTestTable);

    it("drops the length when the type no longer takes one", () => {
      const { updateColumn } = useSchemaStore.getState();
      updateColumn("t1", "c2", { length: 120 });
      updateColumn("t1", "c2", { type: "text" });
      expect(useSchemaStore.getState().schema.tables[0].columns[1]).not.toHaveProperty(
        "length",
      );
    });
  });

  describe("importTables with enums", () => {
    it("adds incoming enums and renames those whose name is taken", () => {
      const store = useSchemaStore.getState();
      store.setSchema({
        ...store.schema,
        enums: [{ id: "e1", name: "status", values: ["a"] }],
      });
      useSchemaStore
        .getState()
        .importTables([], [], [{ id: "e2", name: "status", values: ["b"] }]);
      expect(useSchemaStore.getState().schema.enums?.map((e) => e.name)).toEqual([
        "status",
        "status_2",
      ]);
    });
  });
});
