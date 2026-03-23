import { describe, it, expect } from "vitest";
import { generateMysqlDdl, generatePostgresqlDdl } from "./exportSql";
import type { Schema } from "../types/schema";

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
});
