import { describe, it, expect } from "vitest";
import {
  buildMysqlDdl,
  buildPostgresqlDdl,
  generateMysqlDdl,
  generatePostgresqlDdl,
} from "./exportSql";
import type {
  Column,
  DbType,
  Relation,
  Schema,
  SchemaEnum,
  Table,
  TableIndex,
} from "../types/schema";

function makeSchema(dbType: "mysql" | "postgresql"): Schema {
  return {
    version: "1.0",
    name: "test",
    dbType,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    tables: [
      {
        id: "t1",
        name: "users",
        position: { x: 0, y: 0 },
        columns: [
          {
            id: "c1",
            name: "id",
            type: dbType === "mysql" ? "int" : "uuid",
            isPrimaryKey: true,
            isForeignKey: false,
            isNullable: false,
            isUnique: true,
            isAutoIncrement: dbType === "mysql",
            defaultValue: dbType === "mysql" ? null : "gen_random_uuid()",
          },
          {
            id: "c2",
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
      },
      {
        id: "t2",
        name: "posts",
        position: { x: 100, y: 0 },
        columns: [
          {
            id: "c3",
            name: "id",
            type: dbType === "mysql" ? "int" : "uuid",
            isPrimaryKey: true,
            isForeignKey: false,
            isNullable: false,
            isUnique: true,
            isAutoIncrement: dbType === "mysql",
            defaultValue: null,
          },
          {
            id: "c4",
            name: "user_id",
            type: dbType === "mysql" ? "int" : "uuid",
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
        from: { tableId: "t2", columnId: "c4" },
        to: { tableId: "t1", columnId: "c1" },
        type: "N:1",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
    ],
  };
}

describe("generateMysqlDdl", () => {
  const schema = makeSchema("mysql");
  const ddl = generateMysqlDdl(schema);

  it("generates valid CREATE TABLE statements", () => {
    expect(ddl).toContain("CREATE TABLE `users`");
    expect(ddl).toContain("CREATE TABLE `posts`");
  });

  it("includes column definitions", () => {
    expect(ddl).toContain("`id` INT");
    expect(ddl).toContain("`email` VARCHAR(255)");
  });

  it("includes AUTO_INCREMENT", () => {
    expect(ddl).toContain("AUTO_INCREMENT");
  });

  it("includes PRIMARY KEY", () => {
    expect(ddl).toContain("PRIMARY KEY (`id`)");
  });

  it("includes UNIQUE KEY", () => {
    expect(ddl).toContain("UNIQUE KEY");
    expect(ddl).toContain("`email`");
  });

  it("includes FOREIGN KEY with referential actions", () => {
    expect(ddl).toContain("FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)");
    expect(ddl).toContain("ON DELETE CASCADE");
    expect(ddl).toContain("ON UPDATE CASCADE");
  });

  it("includes ENGINE=InnoDB", () => {
    expect(ddl).toContain("ENGINE=InnoDB");
  });

  it("declares UTF-8 so a client defaulting to latin1 keeps accented text", () => {
    expect(ddl.startsWith("SET NAMES utf8mb4;\n")).toBe(true);
  });
});

describe("generatePostgresqlDdl", () => {
  const schema = makeSchema("postgresql");
  const ddl = generatePostgresqlDdl(schema);

  it("generates valid CREATE TABLE statements", () => {
    expect(ddl).toContain('CREATE TABLE "users"');
    expect(ddl).toContain('CREATE TABLE "posts"');
  });

  it("uses double quotes for identifiers", () => {
    expect(ddl).toContain('"id"');
    expect(ddl).toContain('"email"');
  });

  it("includes DEFAULT for uuid columns", () => {
    expect(ddl).toContain("DEFAULT gen_random_uuid()");
  });

  it("generates FK as ALTER TABLE", () => {
    expect(ddl).toContain('ALTER TABLE "posts" ADD CONSTRAINT');
    expect(ddl).toContain('REFERENCES "users"');
  });

  it("does not include ENGINE", () => {
    expect(ddl).not.toContain("ENGINE");
  });

  it("declares UTF-8 so a client defaulting to latin1 keeps accented text", () => {
    expect(ddl.startsWith("SET client_encoding = 'UTF8';\n\n")).toBe(true);
  });
});

const col = (
  id: string,
  name: string,
  type: Column["type"],
  extra: Partial<Column> = {},
): Column => ({
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
});

function richSchema(dbType: DbType): Schema {
  const pg = dbType === "postgresql";
  return {
    version: "1.0",
    name: "library",
    dbType,
    createdAt: "2026-10-14",
    updatedAt: "2026-10-14",
    enums: [{ id: "e1", name: "loan_status", values: ["active", "it's lost"] }],
    tables: [
      {
        id: "t1",
        name: "members",
        position: { x: 0, y: 0 },
        columns: [
          col("m1", "id", pg ? "serial" : "int", {
            isPrimaryKey: true,
            isUnique: true,
            isAutoIncrement: !pg,
            unsigned: !pg,
          }),
          col("m2", "role", "varchar", { defaultValue: "reader" }),
          col("m3", "code", "varchar", {
            length: 12,
            defaultValue: pg ? "gen_code()" : "uuid()",
          }),
        ],
      },
      {
        id: "t2",
        name: "loans",
        position: { x: 0, y: 0 },
        note: "One row per loan.",
        columns: [
          col("l1", "member_id", pg ? "integer" : "int", { isForeignKey: true }),
          col("l2", "status", "enum", { enumId: "e1", defaultValue: "active" }),
          col("l3", "due_on", "date", { note: "It's due." }),
          col("l4", "fee", pg ? "numeric" : "decimal", { precision: 10, scale: 2 }),
          col("l5", "placed_at", pg ? "timestamp" : "datetime", {
            defaultValue: "CURRENT_TIMESTAMP",
          }),
          col("l6", "title", "varchar", { length: 120, defaultValue: "it's" }),
        ],
        indexes: [
          { id: "i1", columnIds: ["l1", "l3"], unique: false },
          { id: "i2", columnIds: ["l6"], unique: true, name: "loan_title_key" },
          { id: "i3", columnIds: ["l1", "l3"], unique: false },
        ],
      },
    ],
    relations: [
      {
        id: "r1",
        from: { tableId: "t2", columnId: "l1" },
        to: { tableId: "t1", columnId: "m1" },
        type: "N:1",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
    ],
  };
}

describe("generatePostgresqlDdl with enums, indexes, notes and type parameters", () => {
  const ddl = generatePostgresqlDdl(richSchema("postgresql"));

  it("creates enum types before the tables and uses them by name", () => {
    expect(ddl).toContain(`CREATE TYPE "loan_status" AS ENUM ('active', 'it''s lost');`);
    expect(ddl.indexOf("CREATE TYPE")).toBeLessThan(ddl.indexOf("CREATE TABLE"));
    expect(ddl).toContain(`"status" "loan_status" NOT NULL DEFAULT 'active'`);
  });

  it("writes lengths and precision", () => {
    expect(ddl).toContain(`"title" VARCHAR(120)`);
    expect(ddl).toContain(`"code" VARCHAR(12)`);
    expect(ddl).toContain(`"role" VARCHAR(255)`);
    expect(ddl).toContain(`"fee" NUMERIC(10, 2)`);
  });

  it("writes defaults by kind", () => {
    expect(ddl).toContain(`"role" VARCHAR(255) NOT NULL DEFAULT 'reader'`);
    expect(ddl).toContain(`DEFAULT gen_code()`);
    expect(ddl).toContain(`DEFAULT CURRENT_TIMESTAMP`);
    expect(ddl).toContain(`DEFAULT 'it''s'`);
  });

  it("creates indexes after the tables, with derived or chosen names, never twice the same", () => {
    expect(ddl).toContain(
      `CREATE INDEX "loans_member_id_due_on_idx" ON "loans" ("member_id", "due_on");`,
    );
    expect(ddl).toContain(
      `CREATE INDEX "loans_member_id_due_on_idx_2" ON "loans" ("member_id", "due_on");`,
    );
    expect(ddl).toContain(`CREATE UNIQUE INDEX "loan_title_key" ON "loans" ("title");`);
    expect(ddl.indexOf("CREATE INDEX")).toBeGreaterThan(ddl.lastIndexOf("CREATE TABLE"));
  });

  it("writes notes as comments", () => {
    expect(ddl).toContain(`COMMENT ON TABLE "loans" IS 'One row per loan.';`);
    expect(ddl).toContain(`COMMENT ON COLUMN "loans"."due_on" IS 'It''s due.';`);
  });
});

describe("generateMysqlDdl with enums, indexes, notes and type parameters", () => {
  const ddl = generateMysqlDdl(richSchema("mysql"));

  it("writes enum values inline", () => {
    expect(ddl).toContain(
      "`status` ENUM('active', 'it''s lost') NOT NULL DEFAULT 'active'",
    );
  });

  it("writes UNSIGNED and gives a foreign key the sign of the key it references", () => {
    expect(ddl).toContain("`id` INT UNSIGNED NOT NULL AUTO_INCREMENT");
    expect(ddl).toContain("`member_id` INT UNSIGNED NOT NULL");
  });

  it("writes lengths and precision", () => {
    expect(ddl).toContain("`title` VARCHAR(120)");
    expect(ddl).toContain("`fee` DECIMAL(10, 2)");
  });

  it("wraps expression defaults in parentheses, except CURRENT_TIMESTAMP", () => {
    expect(ddl).toContain("`code` VARCHAR(12) NOT NULL DEFAULT (uuid())");
    expect(ddl).toContain("DEFAULT CURRENT_TIMESTAMP");
    expect(ddl).toContain("`role` VARCHAR(255) NOT NULL DEFAULT 'reader'");
  });

  it("declares indexes inside the table, never twice the same name", () => {
    expect(ddl).toContain("KEY `loans_member_id_due_on_idx` (`member_id`, `due_on`)");
    expect(ddl).toContain("KEY `loans_member_id_due_on_idx_2` (`member_id`, `due_on`)");
    expect(ddl).toContain("UNIQUE KEY `loan_title_key` (`title`)");
  });

  it("writes notes as comments", () => {
    expect(ddl).toContain("`due_on` DATE NOT NULL COMMENT 'It''s due.'");
    expect(ddl).toContain(") ENGINE=InnoDB COMMENT='One row per loan.';");
  });

  it("writes every default of a TEXT, BLOB or JSON column as an expression", () => {
    const schema = richSchema("mysql");
    schema.tables[0].columns.push(
      col("m4", "bio", "text", { defaultValue: "none yet" }),
      col("m5", "prefs", "json", { defaultValue: "('{}')", defaultKind: "expression" }),
    );
    const out = generateMysqlDdl(schema);
    expect(out).toContain("`bio` TEXT NOT NULL DEFAULT ('none yet')");
    expect(out).toContain("`prefs` JSON NOT NULL DEFAULT ('{}')");
  });

  it("escapes backslashes in MySQL strings", () => {
    const schema = richSchema("mysql");
    schema.tables[1].note = String.raw`Files live in C:\loans`;
    expect(generateMysqlDdl(schema)).toContain(
      String.raw`COMMENT='Files live in C:\\loans'`,
    );
  });
});

describe("generated names", () => {
  function longSchema(dbType: DbType): Schema {
    const columns = [
      col("a", "order_line_item_id", "integer"),
      col("b", "adjustment_type_id", "integer"),
      col("c", "created_at", "timestamp"),
    ];
    return {
      version: "1.0",
      name: "shop",
      dbType,
      createdAt: "2026-10-14",
      updatedAt: "2026-10-14",
      tables: [
        {
          id: "t1",
          name: "order_line_item_adjustments",
          position: { x: 0, y: 0 },
          columns,
          indexes: [
            { id: "i1", columnIds: ["a", "b"], unique: false },
            { id: "i2", columnIds: ["a", "b", "c"], unique: false },
            { id: "i3", columnIds: ["a", "b"], unique: false },
          ],
        },
      ],
      relations: [],
    };
  }

  const names = (ddl: string, pattern: RegExp) =>
    [...ddl.matchAll(pattern)].map((m) => m[1]);

  it("fit PostgreSQL's 63 bytes and stay distinct", () => {
    const found = names(
      generatePostgresqlDdl(longSchema("postgresql")),
      /INDEX "([^"]+)"/g,
    );
    expect(found).toHaveLength(3);
    expect(new Set(found).size).toBe(3);
    for (const name of found)
      expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(63);
  });

  it("fit MySQL's 64 characters and stay distinct", () => {
    const found = names(generateMysqlDdl(longSchema("mysql")), /KEY `([^`]+)`/g);
    expect(found).toHaveLength(3);
    expect(new Set(found).size).toBe(3);
    for (const name of found) expect(name.length).toBeLessThanOrEqual(64);
  });
});

describe("MySQL UNSIGNED along foreign keys", () => {
  const rel = (
    id: string,
    fromTable: string,
    fromCol: string,
    toTable: string,
    toCol: string,
  ) => ({
    id,
    from: { tableId: fromTable, columnId: fromCol },
    to: { tableId: toTable, columnId: toCol },
    type: "N:1" as const,
    onDelete: "CASCADE" as const,
    onUpdate: "CASCADE" as const,
  });
  const table = (id: string, columns: Column[]) => ({
    id,
    name: id,
    position: { x: 0, y: 0 },
    columns,
  });

  it("follows a chain of foreign keys and stops on cycles", () => {
    const schema: Schema = {
      version: "1.0",
      name: "s",
      dbType: "mysql",
      createdAt: "2026-10-14",
      updatedAt: "2026-10-14",
      tables: [
        table("users", [col("u", "id", "int", { isPrimaryKey: true, unsigned: true })]),
        table("profiles", [
          col("p", "user_id", "int", { isPrimaryKey: true, isForeignKey: true }),
        ]),
        table("photos", [
          col("f", "profile_id", "int", { isForeignKey: true }),
          col("x", "a", "int", { isForeignKey: true }),
          col("y", "b", "int", { isForeignKey: true }),
        ]),
      ],
      relations: [
        rel("r1", "profiles", "p", "users", "u"),
        rel("r2", "photos", "f", "profiles", "p"),
        rel("r3", "photos", "x", "photos", "y"),
        rel("r4", "photos", "y", "photos", "x"),
      ],
    };
    const ddl = generateMysqlDdl(schema);
    expect(ddl).toContain("`user_id` INT UNSIGNED NOT NULL");
    expect(ddl).toContain("`profile_id` INT UNSIGNED NOT NULL");
    expect(ddl).toContain("`a` INT NOT NULL");
  });
});

describe("adjustments that keep the SQL valid", () => {
  function edgeSchema(dbType: DbType): Schema {
    const pg = dbType === "postgresql";
    return {
      version: "1.0",
      name: "s",
      dbType,
      createdAt: "2026-10-14",
      updatedAt: "2026-10-14",
      enums: [
        { id: "e1", name: "status", values: [] },
        { id: "e2", name: "kind", values: ["a", "b"] },
      ],
      tables: [
        {
          id: "t1",
          name: "posts",
          position: { x: 0, y: 0 },
          note: "x".repeat(3000),
          columns: [
            col("p1", "id", pg ? "serial" : "int", {
              isPrimaryKey: true,
              defaultValue: pg ? "1" : null,
            }),
            col("p2", "status", "enum", { enumId: "e1", defaultValue: "draft" }),
            col("p3", "kind", "enum", { enumId: "e2", defaultValue: "c" }),
            col("p4", "maybe", "enum", {
              enumId: "e2",
              isNullable: true,
              defaultValue: "NULL",
            }),
            col("p5", "body", pg ? "json" : "text", {
              isUnique: true,
              note: "y".repeat(1500),
            }),
          ],
          indexes: [
            { id: "i1", columnIds: ["p5"], unique: false, name: "posts_body_idx" },
          ],
        },
      ],
      relations: [],
    };
  }

  it("keeps MySQL valid and lists what it changed", () => {
    const { sql, issues } = buildMysqlDdl(edgeSchema("mysql"));
    expect(sql).toContain("`status` ENUM('') NOT NULL,");
    expect(sql).toContain("`kind` ENUM('a', 'b') NOT NULL,");
    expect(sql).toContain("`maybe` ENUM('a', 'b') DEFAULT NULL");
    expect(sql).not.toContain("posts_body_idx");
    expect(sql).not.toContain("UNIQUE KEY");
    expect(sql).toMatch(/COMMENT 'y{1023}…'/);
    expect(sql).toMatch(/COMMENT='x{2047}…';/);
    expect(issues).toEqual([
      { kind: "emptyEnum", name: "status" },
      { kind: "defaultDropped", table: "posts", column: "status", reason: "enum" },
      { kind: "defaultDropped", table: "posts", column: "kind", reason: "enum" },
      { kind: "noteShortened", table: "posts", column: "body" },
      { kind: "indexSkipped", table: "posts", name: "uk_posts_body", column: "body" },
      { kind: "indexSkipped", table: "posts", name: "posts_body_idx", column: "body" },
      { kind: "noteShortened", table: "posts" },
    ]);
  });

  it("keeps PostgreSQL valid and lists what it changed", () => {
    const { sql, issues } = buildPostgresqlDdl(edgeSchema("postgresql"));
    expect(sql).toContain('"id" SERIAL NOT NULL,');
    expect(sql).toContain('"status" "status" NOT NULL,');
    expect(sql).not.toContain("posts_body_idx");
    expect(sql).not.toContain("uk_posts_body");
    expect(issues).toEqual([
      { kind: "emptyEnum", name: "status" },
      { kind: "defaultDropped", table: "posts", column: "id", reason: "serial" },
      { kind: "defaultDropped", table: "posts", column: "status", reason: "enum" },
      { kind: "defaultDropped", table: "posts", column: "kind", reason: "enum" },
      { kind: "indexSkipped", table: "posts", name: "uk_posts_body", column: "body" },
      { kind: "indexSkipped", table: "posts", name: "posts_body_idx", column: "body" },
    ]);
  });

  it("reports nothing for a schema that needs no change", () => {
    expect(buildPostgresqlDdl(richSchema("postgresql")).issues).toEqual([]);
    expect(buildMysqlDdl(richSchema("mysql")).issues).toEqual([]);
  });
});

describe("what the databases enforce", () => {
  const schemaOf = (
    dbType: DbType,
    tables: Table[],
    relations: Relation[] = [],
    enums: SchemaEnum[] = [],
  ): Schema => ({
    version: "1.0",
    name: "s",
    dbType,
    createdAt: "2026-10-14",
    updatedAt: "2026-10-14",
    enums,
    tables,
    relations,
  });
  const table = (name: string, columns: Column[], indexes: TableIndex[] = []): Table => ({
    id: name,
    name,
    position: { x: 0, y: 0 },
    columns,
    indexes,
  });
  const fk = (from: string, fromCol: string, to: string, toCol: string): Relation => ({
    id: `${from}.${fromCol}`,
    from: { tableId: from, columnId: fromCol },
    to: { tableId: to, columnId: toCol },
    type: "N:1",
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  const countries = () => [
    table("cities", [
      col("c", "country_code", "char", { length: 2, isForeignKey: true }),
    ]),
    table(
      "countries",
      [col("k", "code", "char", { length: 2 })],
      [{ id: "i", columnIds: ["k"], unique: true }],
    ),
  ];

  it("creates PostgreSQL indexes before the foreign keys that rely on them", () => {
    const sql = generatePostgresqlDdl(
      schemaOf("postgresql", countries(), [fk("cities", "c", "countries", "k")]),
    );
    expect(sql.indexOf("CREATE UNIQUE INDEX")).toBeGreaterThan(-1);
    expect(sql.indexOf("CREATE UNIQUE INDEX")).toBeLessThan(sql.indexOf("FOREIGN KEY"));
  });

  it("lets a MySQL table reference a table written after it", () => {
    const sql = generateMysqlDdl(
      schemaOf("mysql", countries(), [fk("cities", "c", "countries", "k")]),
    );
    expect(sql.startsWith("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n")).toBe(
      true,
    );
    expect(sql.endsWith("\n\nSET FOREIGN_KEY_CHECKS = 1;")).toBe(true);
  });

  it("leaves out MySQL keys over 3072 bytes", () => {
    const text = (id: string, extra: Partial<Column> = {}) =>
      col(id, id, "varchar", extra);
    const { sql, issues } = buildMysqlDdl(
      schemaOf("mysql", [
        table(
          "links",
          [
            text("url", { length: 2048, isUnique: true }),
            text("a"),
            text("b"),
            text("c"),
            text("d"),
            col("n", "n", "int"),
            col("m", "m", "decimal", { precision: 10, scale: 2 }),
          ],
          [
            { id: "i1", columnIds: ["a", "b", "c", "d"], unique: false },
            { id: "i2", columnIds: ["a", "b", "c", "n", "m"], unique: false },
          ],
        ),
      ]),
    );
    expect(issues).toEqual([
      { kind: "keyTooLong", table: "links", name: "uk_links_url" },
      { kind: "keyTooLong", table: "links", name: "links_a_b_c_d_idx" },
    ]);
    expect(sql).toContain("KEY `links_a_b_c_n_m_idx` (`a`, `b`, `c`, `n`, `m`)");
  });

  it("keeps MySQL index names apart whatever their case", () => {
    const sql = generateMysqlDdl(
      schemaOf("mysql", [
        table(
          "users",
          [col("e", "email", "varchar", { isUnique: true }), col("n", "name", "varchar")],
          [{ id: "i", columnIds: ["n"], unique: false, name: "UK_users_email" }],
        ),
      ]),
    );
    const keys = [...sql.matchAll(/KEY `([^`]+)`/g)].map((m) => m[1].toLowerCase());
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("writes CURRENT_TIMESTAMP with its ON UPDATE bare in MySQL", () => {
    const sql = generateMysqlDdl(
      schemaOf("mysql", [
        table("posts", [
          col("t", "updated_at", "timestamp", {
            defaultValue: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
          }),
          col("u", "edited_at", "datetime", {
            defaultValue: "now() on update now()",
            defaultKind: "expression",
          }),
        ]),
      ]),
    );
    expect(sql).toContain(
      "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    );
    expect(sql).toContain("`edited_at` DATETIME NOT NULL DEFAULT now() on update now()");
  });

  it("writes an empty text default brought by an import", () => {
    const tables = [
      table("posts", [
        col("t", "title", "varchar", { defaultValue: "", defaultKind: "value" }),
      ]),
    ];
    expect(generatePostgresqlDdl(schemaOf("postgresql", tables))).toContain(
      `"title" VARCHAR(255) NOT NULL DEFAULT ''`,
    );
    expect(generateMysqlDdl(schemaOf("mysql", tables))).toContain(
      "`title` VARCHAR(255) NOT NULL DEFAULT ''",
    );
  });

  it("writes CURRENT_USER as the function it is", () => {
    const tables = [
      table("notes", [
        col("u", "created_by", "varchar", { defaultValue: "CURRENT_USER" }),
      ]),
    ];
    expect(generatePostgresqlDdl(schemaOf("postgresql", tables))).toContain(
      '"created_by" VARCHAR(255) NOT NULL DEFAULT CURRENT_USER',
    );
    expect(generateMysqlDdl(schemaOf("mysql", tables))).toContain(
      "`created_by` VARCHAR(255) NOT NULL DEFAULT (CURRENT_USER)",
    );
  });

  describe("PostgreSQL names past 63 bytes", () => {
    const cut = (name: string) => name.slice(0, 63);
    const created = (sql: string, pattern: RegExp) =>
      [...sql.matchAll(pattern)].map((m) => m[1]);

    it("keeps an index apart from the long table it belongs to", () => {
      const name = "t".repeat(70);
      const sql = generatePostgresqlDdl(
        schemaOf("postgresql", [
          table(
            name,
            [col("a", "a", "integer")],
            [{ id: "i", columnIds: ["a"], unique: false }],
          ),
        ]),
      );
      const [index] = created(sql, /INDEX "([^"]+)"/g);
      expect(index).not.toBe(cut(name));
      expect(new TextEncoder().encode(index).length).toBeLessThanOrEqual(63);
    });

    it("keeps enums apart from tables and from each other", () => {
      const long = "x".repeat(66);
      const sql = generatePostgresqlDdl(
        schemaOf(
          "postgresql",
          [
            table(long, [
              col("s", "status", "enum", { enumId: "e1" }),
              col("k", "kind", "enum", { enumId: "e2" }),
              col("l", "level", "enum", { enumId: "e3" }),
            ]),
          ],
          [],
          [
            { id: "e1", name: `${long}_status`, values: ["a"] },
            { id: "e2", name: `${"y".repeat(63)}_a`, values: ["a"] },
            { id: "e3", name: `${"y".repeat(63)}_b`, values: ["a"] },
          ],
        ),
      );
      const types = created(sql, /CREATE TYPE "([^"]+)"/g);
      expect(new Set([cut(long), ...types].map(cut)).size).toBe(4);
      expect(sql).toContain(`"status" "${types[0]}" NOT NULL`);
      expect(sql).toContain(`"kind" "${types[1]}" NOT NULL`);
      expect(sql).toContain(`"level" "${types[2]}" NOT NULL`);
    });
  });
});
