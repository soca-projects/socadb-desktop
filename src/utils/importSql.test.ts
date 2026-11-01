import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSqlDdl, adaptColumnsToDbType } from "./importSql";
import { generateMysqlDdl, generatePostgresqlDdl } from "./exportSql";
import { defaultSql } from "./columnDefaults";
import { derivedIndexName, indexColumnNames } from "./indexHelpers";
import { LENGTH_TYPES } from "../types/schema";
import type {
  Column,
  DbType,
  Relation,
  Schema,
  SchemaEnum,
  Table,
} from "../types/schema";

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    "utf-8",
  );

// Leaves out ids and enum names: a MySQL enum gets a generated one on import.
function meaning(schema: {
  tables: Table[];
  relations: Relation[];
  enums?: SchemaEnum[];
}) {
  const values = (c: Column) => schema.enums?.find((e) => e.id === c.enumId)?.values;
  const columnName = (tableId: string, columnId: string) => {
    const table = schema.tables.find((t) => t.id === tableId);
    return `${table?.name}.${table?.columns.find((c) => c.id === columnId)?.name}`;
  };
  return {
    tables: schema.tables.map((t) => ({
      name: t.name,
      note: t.note,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        length: c.length ?? (LENGTH_TYPES.has(c.type) ? 255 : undefined),
        precision: c.precision,
        scale: c.scale,
        unsigned: c.unsigned ?? false,
        primaryKey: c.isPrimaryKey,
        nullable: c.isNullable,
        unique: c.isUnique,
        auto: c.isAutoIncrement,
        default: defaultSql(c),
        note: c.note,
        values: values(c),
      })),
      indexes: (t.indexes ?? []).map((i) => ({
        columns: indexColumnNames(t, i),
        unique: i.unique,
        name: i.name ?? derivedIndexName(t, i),
      })),
    })),
    relations: schema.relations.map(
      (r) =>
        `${columnName(r.from.tableId, r.from.columnId)} -> ${columnName(r.to.tableId, r.to.columnId)} ${r.onDelete}/${r.onUpdate}`,
    ),
  };
}

describe("parseSqlDdl", () => {
  it("parses a MySQL dump", () => {
    const sql = `
      CREATE TABLE \`users\` (
        \`id\` INT AUTO_INCREMENT,
        \`name\` VARCHAR(255) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB;

      CREATE TABLE \`posts\` (
        \`id\` INT AUTO_INCREMENT,
        \`user_id\` INT NOT NULL,
        \`title\` VARCHAR(255),
        PRIMARY KEY (\`id\`),
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `;
    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.detectedDbType).toBe("mysql");
    expect(result.attempted).toBe(2);
  });

  it("parses a PostgreSQL dump", () => {
    const sql = `
      CREATE TABLE "users" (
        "id" UUID DEFAULT gen_random_uuid(),
        "email" VARCHAR(255) NOT NULL UNIQUE,
        PRIMARY KEY ("id")
      );

      CREATE TABLE "posts" (
        "id" UUID DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        PRIMARY KEY ("id")
      );

      ALTER TABLE "posts" ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id");
    `;
    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.detectedDbType).toBe("postgresql");
  });

  it("skips temporary tables", () => {
    const sql = "CREATE TEMPORARY TABLE temp (id INT); CREATE TABLE real_table (id INT)";
    const result = parseSqlDdl(sql);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe("real_table");
    expect(result.attempted).toBe(1);
  });

  it("handles empty input", () => {
    const result = parseSqlDdl("");
    expect(result.tables).toHaveLength(0);
    expect(result.relations).toHaveLength(0);
  });
  it("links MySQL enum columns to an enum", () => {
    const result = parseSqlDdl(
      "CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, status ENUM('pending','paid') NOT NULL) ENGINE=InnoDB;",
    );
    const status = result.tables[0].columns.find((c) => c.name === "status");
    expect(result.enums).toHaveLength(1);
    expect(status?.enumId).toBe(result.enums[0].id);
  });
});

describe("adaptColumnsToDbType", () => {
  it("turns a type the database lacks into varchar", () => {
    const tables = [
      {
        id: "t1",
        name: "test",
        position: { x: 0, y: 0 },
        columns: [
          {
            id: "c1",
            name: "col",
            type: "uuid" as const,
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: true,
            isUnique: false,
            isAutoIncrement: false,
            defaultValue: null,
          },
        ],
      },
    ];
    const result = adaptColumnsToDbType(tables, "mysql");
    expect(result.tables[0].columns[0].type).toBe("varchar");
    expect(result.adaptedCount).toBe(1);
  });

  it("keeps a PostgreSQL serial auto-incremented in MySQL", () => {
    const tables = [
      {
        id: "t1",
        name: "orders",
        position: { x: 0, y: 0 },
        columns: [
          {
            id: "c1",
            name: "id",
            type: "bigserial" as const,
            isPrimaryKey: true,
            isForeignKey: false,
            isNullable: false,
            isUnique: true,
            isAutoIncrement: false,
            defaultValue: null,
          },
        ],
      },
    ];
    const [column] = adaptColumnsToDbType(tables, "mysql").tables[0].columns;
    expect(column).toMatchObject({ type: "bigint", isAutoIncrement: true });
  });

  it("keeps valid types unchanged", () => {
    const tables = [
      {
        id: "t1",
        name: "test",
        position: { x: 0, y: 0 },
        columns: [
          {
            id: "c1",
            name: "col",
            type: "varchar" as const,
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: true,
            isUnique: false,
            isAutoIncrement: false,
            defaultValue: null,
          },
        ],
      },
    ];
    const result = adaptColumnsToDbType(tables, "postgresql");
    expect(result.tables[0].columns[0].type).toBe("varchar");
    expect(result.adaptedCount).toBe(0);
  });
  it("keeps enum columns, which both dialects support", () => {
    const tables = [
      {
        id: "t1",
        name: "orders",
        position: { x: 0, y: 0 },
        columns: [
          {
            id: "c1",
            name: "status",
            type: "enum" as const,
            enumId: "e1",
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: false,
            isUnique: false,
            isAutoIncrement: false,
            defaultValue: null,
          },
        ],
      },
    ];
    const result = adaptColumnsToDbType(tables, "postgresql");
    expect(result.tables[0].columns[0]).toMatchObject({ type: "enum", enumId: "e1" });
    expect(result.adaptedCount).toBe(0);
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
  isNullable: true,
  isUnique: false,
  isAutoIncrement: false,
  defaultValue: null,
  ...extra,
});

function library(dbType: DbType): Schema {
  const pg = dbType === "postgresql";
  return {
    version: "1.0",
    name: "library",
    dbType,
    createdAt: "2026-10-14",
    updatedAt: "2026-10-14",
    enums: [{ id: "e1", name: "loan_status", values: ["active", "it's lost", "a,b"] }],
    tables: [
      {
        id: "t1",
        name: "members",
        position: { x: 0, y: 0 },
        columns: [
          col("m1", "id", pg ? "serial" : "int", {
            isPrimaryKey: true,
            isNullable: false,
            isUnique: true,
            isAutoIncrement: true,
            unsigned: !pg,
          }),
          col("m2", "role", "varchar", {
            defaultValue: "reader",
            defaultKind: "value",
            isNullable: false,
          }),
          col("m3", "code", "varchar", {
            length: 36,
            defaultValue: pg ? "gen_random_uuid()::text" : "uuid()",
            defaultKind: "expression",
          }),
          col("m4", "email", "varchar", {
            length: 200,
            isUnique: true,
            note: "Login, not null -- unique",
          }),
        ],
      },
      {
        id: "t2",
        name: "loans",
        position: { x: 0, y: 0 },
        note: "One row per loan; (all of them).",
        columns: [
          col("l1", "member_id", pg ? "integer" : "int", {
            isNullable: false,
            unsigned: !pg,
          }),
          col("l2", "status", "enum", {
            enumId: "e1",
            defaultValue: "active",
            defaultKind: "value",
          }),
          col("l3", "due_on", "date", { note: "It's due." }),
          col("l4", "fee", pg ? "numeric" : "decimal", {
            precision: 10,
            scale: 2,
            defaultValue: "0",
            defaultKind: "value",
          }),
          col("l5", "placed_at", pg ? "timestamp" : "datetime", {
            defaultValue: "CURRENT_TIMESTAMP",
            defaultKind: "expression",
          }),
          col("l6", "title", "varchar", {
            length: 120,
            defaultValue: "it's",
            defaultKind: "value",
          }),
          col("l7", "path", "varchar", {
            defaultValue: String.raw`C:\temp`,
            defaultKind: "value",
          }),
          col("l8", "returned", "boolean", {
            defaultValue: "false",
            defaultKind: "value",
          }),
        ],
        indexes: [
          { id: "i1", columnIds: ["l1", "l3"], unique: false },
          { id: "i2", columnIds: ["l6", "l3"], unique: true, name: "loan_title_due" },
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

describe("round trips through our own export", () => {
  it.each(["postgresql", "mysql"] as const)("gives back the same %s schema", (dbType) => {
    const schema = library(dbType);
    const sql =
      dbType === "mysql" ? generateMysqlDdl(schema) : generatePostgresqlDdl(schema);
    const back = parseSqlDdl(sql);
    expect(back.detectedDbType).toBe(dbType);
    expect(back.issues).toEqual([]);
    expect(meaning(back)).toEqual(meaning(schema));
  });

  it("keeps PostgreSQL enum names", () => {
    const back = parseSqlDdl(generatePostgresqlDdl(library("postgresql")));
    expect(back.enums.map((e) => e.name)).toEqual(["loan_status"]);
  });
});

describe("real dumps", () => {
  it("reads pg_dump's output of an exported schema", () => {
    const back = parseSqlDdl(fixture("pg_dump-rich.sql"));
    expect(back.detectedDbType).toBe("postgresql");
    expect(back.issues).toEqual([]);
    const { tables, relations } = meaning(back);
    const loans = tables.find((t) => t.name === "loans");
    const members = tables.find((t) => t.name === "members");
    expect(members?.columns).toEqual([
      expect.objectContaining({
        name: "id",
        type: "serial",
        primaryKey: true,
        auto: true,
        default: null,
      }),
      expect.objectContaining({
        name: "role",
        length: 255,
        default: "'reader'",
        nullable: false,
      }),
      expect.objectContaining({
        name: "code",
        length: 36,
        default: "(gen_random_uuid())::text",
      }),
    ]);
    expect(loans).toMatchObject({ note: "One row per loan." });
    expect(loans?.columns).toEqual([
      expect.objectContaining({ name: "member_id", type: "integer", nullable: false }),
      expect.objectContaining({
        name: "status",
        type: "enum",
        values: ["active", "it's lost"],
        default: "'active'",
      }),
      expect.objectContaining({ name: "due_on", type: "date", note: "It's due." }),
      expect.objectContaining({ name: "fee", type: "numeric", precision: 10, scale: 2 }),
      expect.objectContaining({
        name: "placed_at",
        type: "timestamp",
        default: "CURRENT_TIMESTAMP",
      }),
      expect.objectContaining({
        name: "title",
        length: 120,
        unique: true,
        default: "'it''s'",
      }),
    ]);
    expect(loans?.indexes).toEqual([
      {
        columns: ["member_id", "due_on"],
        unique: false,
        name: "loans_member_id_due_on_idx",
      },
      {
        columns: ["member_id", "due_on"],
        unique: false,
        name: "loans_member_id_due_on_idx_2",
      },
    ]);
    expect(relations).toEqual(["loans.member_id -> members.id CASCADE/CASCADE"]);
  });

  it("reads mysqldump's output of an exported schema", () => {
    const back = parseSqlDdl(fixture("mysqldump-rich.sql"));
    expect(back.detectedDbType).toBe("mysql");
    expect(back.issues).toEqual([]);
    const { tables, relations } = meaning(back);
    const loans = tables.find((t) => t.name === "loans");
    const members = tables.find((t) => t.name === "members");
    expect(members?.columns).toEqual([
      expect.objectContaining({
        name: "id",
        type: "int",
        unsigned: true,
        primaryKey: true,
        auto: true,
      }),
      expect.objectContaining({ name: "role", length: 255, default: "'reader'" }),
      expect.objectContaining({ name: "code", length: 36, default: "uuid()" }),
    ]);
    expect(loans).toMatchObject({ note: "One row per loan." });
    expect(
      loans?.columns.map((c) => [c.name, c.type, c.default ?? null, c.values ?? null]),
    ).toEqual([
      ["member_id", "int", null, null],
      ["status", "enum", "'active'", ["active", "it's lost"]],
      ["due_on", "date", null, null],
      ["fee", "decimal", null, null],
      ["placed_at", "datetime", "CURRENT_TIMESTAMP", null],
      ["title", "varchar", "'it''s'", null],
    ]);
    expect(loans?.columns[2].note).toBe("It's due.");
    expect(relations).toEqual(["loans.member_id -> members.id CASCADE/CASCADE"]);
  });

  it("reads what pg_dump writes for identities, sequences, checks and odd indexes", () => {
    const back = parseSqlDdl(fixture("pg_dump-extra.sql"));
    const people = meaning(back).tables[0];
    expect(people.note).toBe("Everyone; even 'quoted'.");
    expect(
      Object.fromEntries(people.columns.map((c) => [c.name, [c.type, c.default]])),
    ).toEqual({
      id: ["serial", null],
      legacy_id: ["bigserial", null],
      email: ["varchar", null],
      first_name: ["text", null],
      last_name: ["text", null],
      feeling: ["enum", "'happy'"],
      tags: ["varchar", null],
      price: ["numeric", "0"],
      ratio: ["double precision", null],
      starts_at: ["timestamptz", "now()"],
      note_text: ["varchar", "'it''s -- not a comment'"],
      status: ["varchar", "'draft'"],
      full_name: ["text", null],
    });
    expect(people.columns.find((c) => c.name === "email")).toMatchObject({
      unique: true,
      note: "Login e-mail",
    });
    expect(people.indexes).toEqual([
      { columns: ["first_name", "last_name"], unique: true, name: "people_name_unique" },
      { columns: ["status"], unique: false, name: "people_active" },
      { columns: ["tags"], unique: false, name: "people_tags_gin" },
    ]);
    expect(back.issues).toEqual([
      { kind: "typeGuessed", table: "people", column: "tags", type: "text[]" },
      { kind: "generatedColumn", table: "people", column: "full_name" },
      { kind: "checkSkipped", table: "people" },
      { kind: "indexCondition", table: "people", name: "people_active" },
      {
        kind: "indexSkipped",
        table: "people",
        name: "people_lower_email",
        reason: "expression",
      },
    ]);
  });

  it("reads what mysqldump writes for escapes, spatial and full-text keys and checks", () => {
    const back = parseSqlDdl(fixture("mysqldump-extra.sql"));
    const people = meaning(back).tables[0];
    expect(people.note).toBe("Everyone (all of them)");
    const byName = Object.fromEntries(people.columns.map((c) => [c.name, c]));
    expect(byName.email).toMatchObject({
      nullable: false,
      unique: true,
      note: "Login e-mail, not null, unique",
    });
    expect(byName.bio).toMatchObject({ default: null, note: "default x" });
    expect(byName.feeling).toMatchObject({
      values: ["happy", "it's fine", "sad"],
      default: "'happy'",
    });
    expect(byName.price).toMatchObject({
      type: "decimal",
      precision: 10,
      scale: 2,
      unsigned: true,
      default: "0.00",
    });
    expect(byName.path.default).toBe(String.raw`'C:\temp\new'`);
    expect(byName.updated_at.default).toBe(
      "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    );
    expect(byName.title.default).toBeNull();
    expect(people.indexes).toEqual([
      { columns: ["code", "title"], unique: true, name: "people_code_title" },
      { columns: ["title"], unique: false, name: "people_title_prefix" },
    ]);
    expect(back.issues).toEqual([
      { kind: "typeGuessed", table: "people", column: "geo", type: "point" },
      { kind: "indexSkipped", table: "people", name: "people_geo", reason: "spatial" },
      {
        kind: "indexSkipped",
        table: "people",
        name: "people_bio_ft",
        reason: "fulltext",
      },
      { kind: "checkSkipped", table: "people" },
    ]);
  });
});

describe("dumps with data", () => {
  it("skips pg_dump's COPY blocks, apostrophes and backslashes included", () => {
    const sql = [
      "CREATE TABLE public.authors (id integer NOT NULL, name text);",
      "COPY public.authors (id, name) FROM stdin;",
      "1\tO'Brien",
      "2\t\\N\tC:\\path; DROP",
      "\\.",
      "",
      "ALTER TABLE ONLY public.authors ADD CONSTRAINT authors_pkey PRIMARY KEY (id);",
    ].join("\n");
    const { tables } = parseSqlDdl(sql);
    expect(tables).toHaveLength(1);
    expect(tables[0].columns[0].isPrimaryKey).toBe(true);
  });
});

describe("adaptColumnsToDbType across dialects", () => {
  it("maps synonyms before falling back to varchar", () => {
    const { tables, adaptedCount } = adaptColumnsToDbType(
      [
        {
          id: "t",
          name: "t",
          position: { x: 0, y: 0 },
          columns: [
            col("a", "a", "int"),
            col("b", "b", "decimal"),
            col("c", "c", "mediumint"),
          ],
        },
      ],
      "postgresql",
    );
    expect(tables[0].columns.map((c) => c.type)).toEqual([
      "integer",
      "numeric",
      "integer",
    ]);
    expect(adaptedCount).toBe(0);
  });
});
