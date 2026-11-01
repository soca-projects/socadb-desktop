import { describe, it, expect } from "vitest";
import type { Column } from "../types/schema";
import {
  createDefaultIdColumn,
  defaultKindOf,
  defaultSql,
  idColumnSql,
  type PrimaryKeyKind,
} from "./columnDefaults";
import { buildMysqlDdl, buildPostgresqlDdl } from "./exportSql";
import { createEmptySchema } from "../stores/schemaStore";
import type { DbType } from "../types/schema";

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

  it.each<[DbType, PrimaryKeyKind, Partial<Column>]>([
    ["postgresql", "int", { type: "serial", isAutoIncrement: true, defaultValue: null }],
    ["postgresql", "bigint", { type: "bigserial", defaultValue: null }],
    ["mysql", "bigint", { type: "bigint", isAutoIncrement: true, defaultValue: null }],
    [
      "mysql",
      "uuid",
      { type: "char", length: 36, defaultValue: "(UUID())", defaultKind: "expression" },
    ],
  ])("creates a %s %s id column", (dbType, kind, expected) => {
    expect(createDefaultIdColumn(dbType, kind)).toMatchObject({
      name: "id",
      isPrimaryKey: true,
      isNullable: false,
      ...expected,
    });
  });

  it.each<[DbType, PrimaryKeyKind]>([
    ["postgresql", "uuid"],
    ["postgresql", "int"],
    ["postgresql", "bigint"],
    ["mysql", "uuid"],
    ["mysql", "int"],
    ["mysql", "bigint"],
  ])("shows the %s %s id column as the SQL export writes it", (dbType, kind) => {
    const schema = {
      ...createEmptySchema("t", dbType),
      tables: [
        {
          id: "t",
          name: "t",
          position: { x: 0, y: 0 },
          columns: [createDefaultIdColumn(dbType, kind)],
        },
      ],
    };
    const { sql } =
      dbType === "mysql" ? buildMysqlDdl(schema) : buildPostgresqlDdl(schema);
    expect(sql.replace(/[`"]id[`"]/, "id")).toContain(`  ${idColumnSql(dbType, kind)}`);
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
