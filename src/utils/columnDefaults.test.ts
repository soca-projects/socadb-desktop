import { describe, it, expect } from "vitest";
import type { Column } from "../types/schema";
import { createDefaultIdColumn, defaultKindOf, defaultSql } from "./columnDefaults";

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
    "(uuid())",
    "'{}'::jsonb",
    "now() + interval '30 days'",
    "json_array()",
    "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    "current_user",
    "SESSION_USER",
    "current_schema",
    "now()::date",
    "0::bigint",
    "CURRENT_DATE::text",
    "CURRENT_TIMESTAMP + INTERVAL '30 days'",
    "current_date + 7",
    "(CURRENT_DATE + INTERVAL 1 DAY)",
    "(1 + 2)",
  ])("reads %s as an expression", (value) => {
    expect(defaultKindOf(withDefault(value))).toBe("expression");
  });

  it.each([
    "pending",
    "0",
    "true",
    "now",
    "a (b)",
    "user",
    "::1",
    "fe80::1",
    "2001:db8::abcd",
    "v2::beta",
    "(none)",
    "(not set)",
    "Admin::User",
  ])("reads %s as a value", (value) => {
    expect(defaultKindOf(withDefault(value))).toBe("value");
  });

  it("lets an explicit kind win", () => {
    expect(defaultKindOf(withDefault("now()", { defaultKind: "value" }))).toBe("value");
  });
});

describe("defaultSql", () => {
  const base = createDefaultIdColumn("postgresql");
  const sql = (extra: Partial<Column>) =>
    defaultSql({ ...base, isPrimaryKey: false, ...extra });

  it("writes expressions as they are", () => {
    expect(sql({ type: "timestamptz", defaultValue: "now()" })).toBe("now()");
  });

  it("quotes text and doubles quotes inside it", () => {
    expect(sql({ type: "varchar", defaultValue: "it's" })).toBe("'it''s'");
    expect(sql({ type: "varchar", defaultValue: "0" })).toBe("'0'");
  });

  it("leaves numbers and booleans bare on their own types", () => {
    expect(sql({ type: "numeric", defaultValue: "1.5" })).toBe("1.5");
    expect(sql({ type: "integer", defaultValue: "0" })).toBe("0");
    expect(sql({ type: "boolean", defaultValue: "true" })).toBe("true");
  });

  it("returns null without a default", () => {
    expect(sql({ defaultValue: null })).toBeNull();
    expect(sql({ defaultValue: "  " })).toBeNull();
  });

  it("writes an empty text default an import marked as a value", () => {
    expect(sql({ type: "varchar", defaultValue: "", defaultKind: "value" })).toBe("''");
  });
});
