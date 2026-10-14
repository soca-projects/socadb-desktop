import { describe, it, expect, beforeEach } from "vitest";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import { changeColumnType } from "./columnActions";
import type { Column, DbType } from "../types/schema";

function col(id: string, name: string, extra: Partial<Column> = {}): Column {
  return {
    id,
    name,
    type: "varchar",
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: false,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
    ...extra,
  };
}

function setup(dbType: DbType, columns: Column[]) {
  useSchemaStore.setState({
    schema: {
      ...createEmptySchema("s", dbType),
      tables: [{ id: "t1", name: "members", position: { x: 0, y: 0 }, columns }],
    },
    filePath: null,
    savedAt: null,
  });
}

const column = (id: string) =>
  useSchemaStore.getState().schema.tables[0].columns.find((c) => c.id === id);

describe("changeColumnType", () => {
  beforeEach(() => setup("postgresql", [col("c1", "role", { defaultValue: "reader" })]));

  it("turns a column into a new enum whose first value is its text default", () => {
    changeColumnType("t1", "c1", "enum");
    const { enums } = useSchemaStore.getState().schema;
    expect(enums?.[0]).toMatchObject({ name: "members_role", values: ["reader"] });
    expect(column("c1")).toMatchObject({ type: "enum", defaultValue: "reader" });
  });

  it("does not turn an expression default into an enum value", () => {
    setup("postgresql", [col("c1", "code", { defaultValue: "gen_code()" })]);
    changeColumnType("t1", "c1", "enum");
    expect(useSchemaStore.getState().schema.enums?.[0].values).toEqual([]);
  });

  it("reuses an enum and keeps the default only if it is one of its values", () => {
    const store = useSchemaStore.getState();
    store.setSchema({
      ...store.schema,
      enums: [{ id: "e1", name: "member_role", values: ["reader", "librarian"] }],
    });
    changeColumnType("t1", "c1", "enum:e1");
    expect(column("c1")).toMatchObject({
      type: "enum",
      enumId: "e1",
      defaultValue: "reader",
    });
  });

  it("goes back to text and drops the enum it no longer uses", () => {
    changeColumnType("t1", "c1", "enum");
    changeColumnType("t1", "c1", "varchar");
    expect(column("c1")?.type).toBe("varchar");
    expect(column("c1")).not.toHaveProperty("enumId");
    expect(useSchemaStore.getState().schema.enums).toEqual([]);
  });

  it("clears a default a boolean cannot take and auto-increment outside MySQL integers", () => {
    setup("mysql", [
      col("c1", "id", { type: "int", isAutoIncrement: true, defaultValue: "x" }),
    ]);
    changeColumnType("t1", "c1", "bigint");
    expect(column("c1")?.isAutoIncrement).toBe(true);
    changeColumnType("t1", "c1", "boolean");
    expect(column("c1")).toMatchObject({ isAutoIncrement: false, defaultValue: null });
  });

  it("ignores values that are not column types", () => {
    changeColumnType("t1", "c1", "not-a-type");
    expect(column("c1")?.type).toBe("varchar");
  });
});
