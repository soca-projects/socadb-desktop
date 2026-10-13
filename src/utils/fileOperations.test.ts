import { describe, it, expect } from "vitest";
import { parseSchemaContent } from "./fileOperations";

function column(
  id: string,
  name: string,
  type: string,
  extra: Record<string, unknown> = {},
) {
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

function file(
  extra: Record<string, unknown> = {},
  tableExtra: Record<string, unknown> = {},
) {
  return {
    version: "1.0",
    name: "library",
    dbType: "postgresql",
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
    tables: [
      {
        id: "t1",
        name: "loans",
        position: { x: 0, y: 0 },
        columns: [
          column("c1", "id", "serial", { isPrimaryKey: true }),
          column("c2", "status", "enum", { enumId: "e1", note: "Where it stands." }),
        ],
        ...tableExtra,
      },
    ],
    relations: [],
    ...extra,
  };
}

describe("parseSchemaContent", () => {
  it("keeps notes, indexes and enums", () => {
    const schema = parseSchemaContent(
      JSON.stringify(
        file(
          { enums: [{ id: "e1", name: "loan_status", values: ["active", "returned"] }] },
          {
            note: "One row per loan.",
            indexes: [{ id: "i1", columnIds: ["c2"], unique: false }],
          },
        ),
      ),
    );
    expect(schema.enums).toEqual([
      { id: "e1", name: "loan_status", values: ["active", "returned"] },
    ]);
    expect(schema.tables[0].note).toBe("One row per loan.");
    expect(schema.tables[0].indexes).toEqual([
      { id: "i1", columnIds: ["c2"], unique: false },
    ]);
    expect(schema.tables[0].columns[1].note).toBe("Where it stands.");
    expect(schema.tables[0].columns[1].enumId).toBe("e1");
  });

  it("keeps type parameters and the default kind, and drops invalid values instead of failing", () => {
    const f = file({ enums: [{ id: "e1", name: "loan_status", values: [] }] });
    f.tables[0].columns.push(
      column("c3", "title", "varchar", { length: 120 }),
      column("c4", "price", "numeric", { precision: 8, scale: 2 }),
      column("c5", "code", "char", { length: -1 }),
      column("c6", "label", "text", { defaultValue: "now()", defaultKind: "value" }),
    );
    const schema = parseSchemaContent(JSON.stringify(f));
    const [, , title, price, code, label] = schema.tables[0].columns;
    expect(title.length).toBe(120);
    expect(price).toMatchObject({ precision: 8, scale: 2 });
    expect(code.length).toBeUndefined();
    expect(label.defaultKind).toBe("value");
  });
});
