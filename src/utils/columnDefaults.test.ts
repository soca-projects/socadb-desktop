import { describe, it, expect } from "vitest";
import { createDefaultIdColumn } from "./columnDefaults";

describe("createDefaultIdColumn", () => {
  it("creates a MySQL id column with auto increment", () => {
    const col = createDefaultIdColumn("mysql");
    expect(col.name).toBe("id");
    expect(col.type).toBe("int");
    expect(col.isPrimaryKey).toBe(true);
    expect(col.isAutoIncrement).toBe(true);
    expect(col.isNullable).toBe(false);
    expect(col.isUnique).toBe(true);
    expect(col.defaultValue).toBeNull();
  });

  it("creates a PostgreSQL id column with uuid default", () => {
    const col = createDefaultIdColumn("postgresql");
    expect(col.name).toBe("id");
    expect(col.type).toBe("uuid");
    expect(col.isPrimaryKey).toBe(true);
    expect(col.isAutoIncrement).toBe(false);
    expect(col.defaultValue).toBe("gen_random_uuid()");
  });

  it("generates a unique id for each call", () => {
    const a = createDefaultIdColumn("mysql");
    const b = createDefaultIdColumn("mysql");
    expect(a.id).not.toBe(b.id);
  });
});
