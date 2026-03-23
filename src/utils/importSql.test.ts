import { describe, it, expect } from "vitest";
import { parseSqlDdl, adaptColumnsToDbType } from "./importSql";

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
});

describe("adaptColumnsToDbType", () => {
  it("converts invalid types to varchar", () => {
    const tables = [
      {
        id: "t1",
        name: "test",
        position: { x: 0, y: 0 },
        columns: [
          {
            id: "c1",
            name: "col",
            type: "mediumtext" as const,
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
    expect(result.adaptedCount).toBe(1);
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
});
