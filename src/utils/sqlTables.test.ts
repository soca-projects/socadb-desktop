import { describe, it, expect } from "vitest";
import { parseCreateTable } from "./sqlTables";
import { parseStatements } from "./sqlParser";
import type { DbType } from "../types/schema";

describe("parseCreateTable", () => {
  it("parses a MySQL CREATE TABLE", () => {
    const sql =
      "CREATE TABLE `users` (`id` INT AUTO_INCREMENT, `name` VARCHAR(255), PRIMARY KEY (`id`))";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.name).toBe("users");
    expect(result.table.columns).toHaveLength(2);
    expect(result.table.columns[0].isPrimaryKey).toBe(true);
  });

  it("parses a PostgreSQL CREATE TABLE", () => {
    const sql =
      'CREATE TABLE "users" ("id" UUID DEFAULT gen_random_uuid(), "email" VARCHAR(255) NOT NULL)';
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.name).toBe("users");
    expect(result.table.columns).toHaveLength(2);
  });

  it("extracts inline foreign keys", () => {
    const sql =
      "CREATE TABLE posts (id INT, user_id INT, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.pendingFks).toHaveLength(1);
    expect(result.pendingFks[0].fromColumn).toBe("user_id");
    expect(result.pendingFks[0].toTable).toBe("users");
    expect(result.pendingFks[0].onDelete).toBe("CASCADE");
  });

  it("handles IF NOT EXISTS", () => {
    const sql = "CREATE TABLE IF NOT EXISTS users (id INT)";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.name).toBe("users");
  });

  it("handles schema-qualified names", () => {
    const sql = "CREATE TABLE public.users (id INT)";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.name).toBe("users");
  });

  it("returns null for invalid statements", () => {
    expect(parseCreateTable("SELECT 1")).toBeNull();
  });

  it("marks a column unique from a one-column UNIQUE constraint", () => {
    const sql = "CREATE TABLE users (id INT, email VARCHAR(255), UNIQUE (email))";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    const emailCol = result.table.columns.find((c) => c.name === "email");
    expect(emailCol).toBeDefined();
    if (!emailCol) return;
    expect(emailCol.isUnique).toBe(true);
  });

  it("parses NOT NULL column", () => {
    const sql = "CREATE TABLE t (email VARCHAR(255) NOT NULL)";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].isNullable).toBe(false);
  });

  it("parses AUTO_INCREMENT column", () => {
    const sql = "CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY)";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].isAutoIncrement).toBe(true);
    expect(result.table.columns[0].isPrimaryKey).toBe(true);
  });

  it("parses DEFAULT value", () => {
    const sql = "CREATE TABLE t (status VARCHAR(20) DEFAULT 'active')";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].defaultValue).toBe("active");
  });

  it("records whether a default was a quoted value or an expression", () => {
    const sql =
      "CREATE TABLE t (a VARCHAR(20) DEFAULT 'x', b CHAR(36) DEFAULT (uuid()), c INT)";
    const result = parseCreateTable(sql, "mysql");
    expect(result).not.toBeNull();
    if (!result) return;
    const [a, b, c] = result.table.columns;
    expect(a).toMatchObject({ defaultValue: "x", defaultKind: "value" });
    expect(b).toMatchObject({ defaultValue: "uuid()", defaultKind: "expression" });
    expect(c).not.toHaveProperty("defaultKind");
  });

  it("keeps the quotes of a default with a backslash when the dialect is unknown", () => {
    const result = parseCreateTable(
      String.raw`CREATE TABLE t (p VARCHAR(20) DEFAULT 'C:\\temp')`,
    );
    expect(result?.table.columns[0]).toMatchObject({
      defaultValue: String.raw`'C:\\temp'`,
      defaultKind: "expression",
    });
  });

  it("normalizes TINYINT(1) to boolean", () => {
    const sql = "CREATE TABLE t (is_active TINYINT(1))";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].type).toBe("boolean");
  });

  it("detects SERIAL as auto-increment", () => {
    const sql = "CREATE TABLE t (id SERIAL PRIMARY KEY)";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].type).toBe("serial");
    expect(result.table.columns[0].isAutoIncrement).toBe(true);
  });

  it("handles backtick-quoted column names", () => {
    const sql = "CREATE TABLE t (`user name` VARCHAR(100))";
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].name).toBe("user name");
  });

  it("handles double-quoted column names", () => {
    const sql = 'CREATE TABLE t ("user name" VARCHAR(100))';
    const result = parseCreateTable(sql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.table.columns[0].name).toBe("user name");
  });
});

describe("table elements", () => {
  const table = (sql: string, dialect: DbType = "mysql") =>
    parseStatements([sql], dialect);

  it("keeps a composite key from making each column unique", () => {
    const { tables } = table(
      "CREATE TABLE t (a INT, b INT, c INT, PRIMARY KEY (a, b), FOREIGN KEY (a) REFERENCES t (c))",
    );
    const [a, b] = tables[0].columns;
    expect([a.isPrimaryKey, b.isPrimaryKey, a.isUnique, b.isUnique]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("reads MySQL keys, skips full-text and spatial ones, and reports CHECK", () => {
    const { tables, issues } = table(
      "CREATE TABLE `people` (`code` char(3), `title` varchar(120), `email` varchar(200), `bio` text, `geo` point, UNIQUE KEY `people_email` (`email`), UNIQUE KEY `people_code_title` (`code`,`title`), KEY `people_title_prefix` (`title`(20)), KEY `people_code_idx` (`code`) USING BTREE, FULLTEXT KEY `people_bio_ft` (`bio`), SPATIAL KEY `people_geo` (`geo`), CONSTRAINT `people_check` CHECK ((`code` <> ''))) ENGINE=InnoDB COMMENT='Everyone (all of them)'",
    );
    const t = tables[0];
    const [code, title, email] = t.columns;
    expect(email.isUnique).toBe(true);
    expect(t.indexes).toEqual([
      {
        id: expect.any(String),
        columnIds: [code.id, title.id],
        unique: true,
        name: "people_code_title",
      },
      {
        id: expect.any(String),
        columnIds: [title.id],
        unique: false,
        name: "people_title_prefix",
      },
      { id: expect.any(String), columnIds: [code.id], unique: false },
    ]);
    expect(t.note).toBe("Everyone (all of them)");
    expect(issues).toEqual([
      { kind: "typeGuessed", table: "people", column: "geo", type: "point" },
      {
        kind: "indexSkipped",
        table: "people",
        name: "people_bio_ft",
        reason: "fulltext",
      },
      { kind: "indexSkipped", table: "people", name: "people_geo", reason: "spatial" },
      { kind: "checkSkipped", table: "people" },
    ]);
  });

  it("reads CREATE INDEX, skipping expressions and reporting conditions", () => {
    const { tables, issues } = parseStatements(
      [
        "CREATE TABLE public.people (email varchar(200), status varchar(20), tags varchar(80))",
        "CREATE UNIQUE INDEX people_email_key2 ON public.people USING btree (email)",
        "CREATE INDEX people_lower_email ON public.people USING btree (lower((email)::text))",
        "CREATE INDEX people_active ON public.people USING btree (status) WHERE ((status)::text <> 'archived'::text)",
        "CREATE INDEX IF NOT EXISTS people_tags_idx ON ONLY people USING gin (tags DESC NULLS LAST)",
      ],
      "postgresql",
    );
    const [email, status, tags] = tables[0].columns;
    expect(email.isUnique).toBe(true);
    expect(tables[0].indexes).toEqual([
      {
        id: expect.any(String),
        columnIds: [status.id],
        unique: false,
        name: "people_active",
      },
      { id: expect.any(String), columnIds: [tags.id], unique: false },
    ]);
    expect(issues).toEqual([
      {
        kind: "indexSkipped",
        table: "people",
        name: "people_lower_email",
        reason: "expression",
      },
      { kind: "indexCondition", table: "people", name: "people_active" },
    ]);
  });

  it("reads COMMENT ON for tables and columns", () => {
    const { tables } = parseStatements(
      [
        "CREATE TABLE public.people (email varchar(200), name text)",
        "COMMENT ON TABLE public.people IS 'Everyone; even ''quoted''.'",
        "COMMENT ON COLUMN public.people.email IS 'Login e-mail'",
        "COMMENT ON COLUMN people.name IS 'Old'",
        "COMMENT ON COLUMN people.name IS NULL",
      ],
      "postgresql",
    );
    expect(tables[0].note).toBe("Everyone; even 'quoted'.");
    expect(tables[0].columns[0].note).toBe("Login e-mail");
    expect(tables[0].columns[1]).not.toHaveProperty("note");
  });
});
