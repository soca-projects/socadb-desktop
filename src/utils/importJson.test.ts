import { describe, it, expect } from "vitest";
import { parseJsonSchema } from "./importJson";

const validJson = JSON.stringify({
  name: "test",
  dbType: "postgresql",
  tables: [
    {
      id: "old-t1",
      name: "users",
      position: { x: 0, y: 0 },
      columns: [
        {
          id: "old-c1",
          name: "id",
          type: "uuid",
          isPrimaryKey: true,
          isForeignKey: false,
          isNullable: false,
          isUnique: true,
          isAutoIncrement: false,
          defaultValue: null,
        },
      ],
    },
  ],
  relations: [],
});

describe("parseJsonSchema", () => {
  it("parses valid JSON schema", () => {
    const result = parseJsonSchema(validJson);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe("users");
    expect(result.detectedDbType).toBe("postgresql");
  });

  it("remaps table and column ids", () => {
    const result = parseJsonSchema(validJson);
    expect(result.tables[0].id).not.toBe("old-t1");
    expect(result.tables[0].columns[0].id).not.toBe("old-c1");
  });

  it("remaps relation ids to new table/column ids", () => {
    const json = JSON.stringify({
      dbType: "postgresql",
      tables: [
        {
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
          ],
        },
        {
          id: "t2",
          name: "posts",
          position: { x: 100, y: 0 },
          columns: [
            {
              id: "c2",
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
        },
      ],
      relations: [
        {
          id: "r1",
          from: { tableId: "t2", columnId: "c2" },
          to: { tableId: "t1", columnId: "c1" },
          type: "N:1",
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
      ],
    });

    const result = parseJsonSchema(json);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].id).not.toBe("r1");
    expect(result.relations[0].from.tableId).toBe(result.tables[1].id);
    expect(result.relations[0].to.tableId).toBe(result.tables[0].id);
  });

  it("skips invalid tables", () => {
    const json = JSON.stringify({
      dbType: "postgresql",
      tables: [
        { id: "t1", name: "valid", position: { x: 0, y: 0 }, columns: [] },
        { invalid: true },
        "not an object",
      ],
      relations: [],
    });
    const result = parseJsonSchema(json);
    expect(result.tables).toHaveLength(1);
    expect(result.attempted).toBe(3);
  });

  it("throws on missing tables array", () => {
    expect(() => parseJsonSchema(JSON.stringify({ relations: [] }))).toThrow();
  });

  it("throws on missing relations array", () => {
    expect(() => parseJsonSchema(JSON.stringify({ tables: [] }))).toThrow();
  });

  it("detects mysql dbType", () => {
    const json = JSON.stringify({
      dbType: "mysql",
      tables: [],
      relations: [],
    });
    const result = parseJsonSchema(json);
    expect(result.detectedDbType).toBe("mysql");
  });
});
