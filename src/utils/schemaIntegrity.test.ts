import { describe, it, expect } from "vitest";
import type { Column, Schema, SchemaEnum, Table } from "../types/schema";
import {
  dropEnumsLeftUnused,
  linkEnumColumns,
  normalizeSchema,
  pruneColumnFields,
  pruneIndexes,
  renameEnumsAgainst,
  uniqueEnumName,
} from "./schemaIntegrity";

function col(
  id: string,
  name: string,
  type: Column["type"],
  extra: Partial<Column> = {},
): Column {
  return {
    id,
    name,
    type,
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: false,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
    ...extra,
  };
}

function table(
  id: string,
  name: string,
  columns: Column[],
  extra: Partial<Table> = {},
): Table {
  return { id, name, position: { x: 0, y: 0 }, columns, ...extra };
}

function schema(tables: Table[], enums?: SchemaEnum[]): Schema {
  return {
    version: "1.0",
    name: "s",
    dbType: "postgresql",
    createdAt: "",
    updatedAt: "",
    tables,
    relations: [],
    ...(enums ? { enums } : {}),
  };
}

const status: SchemaEnum = {
  id: "e1",
  name: "loan_status",
  values: ["active", "returned"],
};

describe("uniqueEnumName", () => {
  it("returns the base when free", () => {
    expect(uniqueEnumName("loans_status", [status])).toBe("loans_status");
  });
  it("adds a counter when taken", () => {
    expect(uniqueEnumName("loan_status", [status])).toBe("loan_status_2");
  });
  it("avoids table names, which PostgreSQL also uses for types", () => {
    expect(uniqueEnumName("loans", [], ["loans"])).toBe("loans_2");
  });
});

describe("renameEnumsAgainst", () => {
  it("renames incoming enums whose name is taken, including by each other", () => {
    const incoming = [
      { id: "x1", name: "loan_status", values: [] },
      { id: "x2", name: "loan_status", values: [] },
    ];
    expect(renameEnumsAgainst([status], incoming).map((e) => e.name)).toEqual([
      "loan_status_2",
      "loan_status_3",
    ]);
  });
});

describe("linkEnumColumns", () => {
  it("creates an empty enum for an enum column with no valid link", () => {
    const tables = [table("t1", "orders", [col("c1", "status", "enum")])];
    const result = linkEnumColumns(tables, []);
    expect(result.enums).toHaveLength(1);
    expect(result.enums[0]).toMatchObject({ name: "orders_status", values: [] });
    expect(result.tables[0].columns[0].enumId).toBe(result.enums[0].id);
  });

  it("drops enumId from columns that are not enums", () => {
    const tables = [
      table("t1", "loans", [col("c1", "status", "varchar", { enumId: "e1" })]),
    ];
    const result = linkEnumColumns(tables, [status]);
    expect(result.tables[0].columns[0]).not.toHaveProperty("enumId");
  });

  it("returns the same arrays when nothing changes", () => {
    const tables = [
      table("t1", "loans", [col("c1", "status", "enum", { enumId: "e1" })]),
    ];
    const enums = [status];
    const result = linkEnumColumns(tables, enums);
    expect(result.tables).toBe(tables);
    expect(result.enums).toBe(enums);
  });
});

describe("pruneIndexes", () => {
  it("removes missing columns and drops indexes left empty", () => {
    const tables = [
      table("t1", "loans", [col("c1", "id", "serial"), col("c2", "due_on", "date")], {
        indexes: [
          { id: "i1", columnIds: ["c2", "gone"], unique: false },
          { id: "i2", columnIds: ["gone"], unique: true },
        ],
      }),
    ];
    const result = pruneIndexes(tables);
    expect(result[0].indexes).toEqual([{ id: "i1", columnIds: ["c2"], unique: false }]);
  });

  it("returns the same array when every index is valid", () => {
    const tables = [
      table("t1", "loans", [col("c1", "id", "serial")], {
        indexes: [{ id: "i1", columnIds: ["c1"], unique: false }],
      }),
    ];
    expect(pruneIndexes(tables)).toBe(tables);
  });
});

describe("dropEnumsLeftUnused", () => {
  it("drops an enum the change left without columns", () => {
    const before = [
      table("t1", "loans", [col("c1", "status", "enum", { enumId: "e1" })]),
    ];
    const after = [table("t1", "loans", [col("c1", "status", "varchar")])];
    expect(dropEnumsLeftUnused(before, after, [status])).toEqual([]);
  });

  it("keeps an enum that was already unused", () => {
    const before = [table("t1", "loans", [col("c1", "id", "serial")])];
    const after = [table("t1", "loans", [col("c1", "id", "integer")])];
    expect(dropEnumsLeftUnused(before, after, [status])).toEqual([status]);
  });

  it("keeps an enum another column still uses", () => {
    const before = [
      table("t1", "loans", [
        col("c1", "status", "enum", { enumId: "e1" }),
        col("c2", "previous", "enum", { enumId: "e1" }),
      ]),
    ];
    const after = [
      table("t1", "loans", [
        col("c1", "status", "varchar"),
        col("c2", "previous", "enum", { enumId: "e1" }),
      ]),
    ];
    expect(dropEnumsLeftUnused(before, after, [status])).toEqual([status]);
  });
});

describe("pruneColumnFields", () => {
  it("drops type parameters the type does not take", () => {
    const tables = [
      table("t1", "books", [
        col("c1", "title", "text", { length: 120 }),
        col("c2", "price", "integer", { precision: 8, scale: 2 }),
        col("c3", "isbn", "varchar", { length: 13 }),
        col("c4", "ratio", "numeric", { scale: 2 }),
      ]),
    ];
    const [title, price, isbn, ratio] = pruneColumnFields(tables)[0].columns;
    expect(title).not.toHaveProperty("length");
    expect(price).not.toHaveProperty("precision");
    expect(price).not.toHaveProperty("scale");
    expect(isbn.length).toBe(13);
    expect(ratio).not.toHaveProperty("scale");
  });

  it("keeps UNSIGNED only on MySQL numeric columns", () => {
    const tables = [
      table("t1", "orders", [
        col("c1", "id", "int", { unsigned: true }),
        col("c2", "code", "varchar", { unsigned: true }),
      ]),
    ];
    const [id, code] = pruneColumnFields(tables, "mysql")[0].columns;
    expect(id.unsigned).toBe(true);
    expect(code).not.toHaveProperty("unsigned");
    expect(pruneColumnFields(tables, "postgresql")[0].columns[0]).not.toHaveProperty(
      "unsigned",
    );
  });

  it("drops the default kind when there is no default", () => {
    const tables = [
      table("t1", "books", [col("c1", "title", "text", { defaultKind: "value" })]),
    ];
    expect(pruneColumnFields(tables)[0].columns[0]).not.toHaveProperty("defaultKind");
  });

  it("returns the same array when every column is clean", () => {
    const tables = [table("t1", "books", [col("c1", "isbn", "varchar", { length: 13 })])];
    expect(pruneColumnFields(tables)).toBe(tables);
  });
});

describe("normalizeSchema", () => {
  it("returns the same object when nothing needs fixing", () => {
    const s = schema([table("t1", "loans", [col("c1", "id", "serial")])]);
    expect(normalizeSchema(s)).toBe(s);
  });

  it("renames an enum that a table took the name of", () => {
    const s = schema(
      [
        table("t1", "users", [col("c1", "role", "enum", { enumId: "e1" })]),
        table("t2", "user_role", [col("c2", "id", "serial")]),
      ],
      [{ id: "e1", name: "user_role", values: ["admin"] }],
    );
    expect(normalizeSchema(s).enums).toEqual([
      { id: "e1", name: "user_role_2", values: ["admin"] },
    ]);
  });

  it("does not add an enums key to a schema that has none", () => {
    const prev = schema([table("t1", "loans", [col("c1", "id", "serial")])]);
    const next = schema([table("t1", "loans_v2", [col("c1", "id", "serial")])]);
    expect(normalizeSchema(next, prev)).not.toHaveProperty("enums");
  });

  it("links, prunes and drops in one pass", () => {
    const prev = schema(
      [table("t1", "loans", [col("c1", "status", "enum", { enumId: "e1" })])],
      [status],
    );
    const next = schema(
      [
        table(
          "t1",
          "loans",
          [col("c1", "status", "varchar"), col("c2", "kind", "enum")],
          {
            indexes: [{ id: "i1", columnIds: ["gone"], unique: false }],
          },
        ),
      ],
      [status],
    );
    const result = normalizeSchema(next, prev);
    expect(result.enums?.map((e) => e.name)).toEqual(["loans_kind"]);
    expect(result.tables[0].indexes).toEqual([]);
  });
});
