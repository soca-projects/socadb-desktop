import { describe, it, expect } from "vitest";
import type { Column } from "../types/schema";
import { createDefaultIdColumn, defaultKindOf } from "./columnDefaults";

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

describe("defaultKindOf", () => {
  const withDefault = (
    defaultValue: string | null,
    extra: Partial<Column> = {},
  ): Column => ({
    ...createDefaultIdColumn("postgresql"),
    type: "varchar",
    isPrimaryKey: false,
    defaultValue,
    ...extra,
  });

  it.each([
    "now()",
    "gen_random_uuid()",
    "CURRENT_TIMESTAMP",
    "current_date",
    "NULL",
    "nextval('loans_id_seq')",
    "'quoted by hand'",
  ])("reads %s as an expression", (value) => {
    expect(defaultKindOf(withDefault(value))).toBe("expression");
  });

  it.each(["pending", "0", "true", "now", "a (b)"])("reads %s as a value", (value) => {
    expect(defaultKindOf(withDefault(value))).toBe("value");
  });

  it("lets an explicit kind win", () => {
    expect(defaultKindOf(withDefault("now()", { defaultKind: "value" }))).toBe("value");
  });
});
