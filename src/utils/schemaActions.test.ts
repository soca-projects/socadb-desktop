import { describe, it, expect, beforeEach } from "vitest";
import { createTable, duplicateTable } from "./schemaActions";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";

function resetStore() {
  useSchemaStore.setState({
    schema: createEmptySchema("test", "postgresql"),
    filePath: null,
    savedAt: null,
  });
}

describe("createTable", () => {
  beforeEach(resetStore);

  it("creates a table with default name", () => {
    const id = createTable();
    const { schema } = useSchemaStore.getState();
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].id).toBe(id);
    expect(schema.tables[0].name).toBe("new_table_1");
  });

  it("creates a table with custom name", () => {
    createTable({ name: "users" });
    expect(useSchemaStore.getState().schema.tables[0].name).toBe("users");
  });

  it("creates default id column when no columns provided", () => {
    createTable({ name: "users" });
    const cols = useSchemaStore.getState().schema.tables[0].columns;
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe("id");
    expect(cols[0].isPrimaryKey).toBe(true);
  });

  it("uses provided columns when given", () => {
    createTable({
      name: "users",
      columns: [
        {
          id: "c1",
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
    const cols = useSchemaStore.getState().schema.tables[0].columns;
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe("email");
  });

  it("assigns a color", () => {
    createTable();
    expect(useSchemaStore.getState().schema.tables[0].color).toBeDefined();
  });
});

describe("duplicateTable", () => {
  beforeEach(resetStore);

  it("duplicates a table with _copy suffix", () => {
    const id = createTable({ name: "users" });
    const newId = duplicateTable(id);
    expect(newId).not.toBeNull();
    const { schema } = useSchemaStore.getState();
    expect(schema.tables).toHaveLength(2);
    expect(schema.tables[1].name).toBe("users_copy");
  });

  it("duplicates columns with new ids", () => {
    const id = createTable({ name: "users" });
    duplicateTable(id);
    const { schema } = useSchemaStore.getState();
    const original = schema.tables[0].columns[0];
    const copy = schema.tables[1].columns[0];
    expect(copy.name).toBe(original.name);
    expect(copy.id).not.toBe(original.id);
  });

  it("resets isForeignKey on duplicated columns", () => {
    const id = createTable({ name: "users" });
    useSchemaStore
      .getState()
      .updateColumn(id, useSchemaStore.getState().schema.tables[0].columns[0].id, {
        isForeignKey: true,
      });
    duplicateTable(id);
    const { schema } = useSchemaStore.getState();
    expect(schema.tables[1].columns[0].isForeignKey).toBe(false);
  });

  it("returns null for missing table", () => {
    expect(duplicateTable("missing")).toBeNull();
  });
});
