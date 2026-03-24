import { describe, it, expect } from "vitest";
import {
  stripComments,
  splitStatements,
  detectDbType,
  parseCreateTable,
  parseAlterTableFks,
  resolveForeignKeys,
} from "./sqlParser";

describe("stripComments", () => {
  it("removes single-line comments", () => {
    expect(stripComments("SELECT * FROM t; -- comment")).toBe("SELECT * FROM t; ");
  });

  it("removes multi-line comments", () => {
    expect(stripComments("SELECT /* block */ * FROM t")).toBe("SELECT  * FROM t");
  });

  it("handles both comment types", () => {
    const sql = "-- header\nSELECT /* x */ *\n-- footer";
    const result = stripComments(sql);
    expect(result).not.toContain("--");
    expect(result).not.toContain("/*");
  });
});

describe("splitStatements", () => {
  it("splits on semicolons", () => {
    const result = splitStatements("CREATE TABLE a (id INT); CREATE TABLE b (id INT)");
    expect(result).toHaveLength(2);
  });

  it("ignores semicolons inside quotes", () => {
    const result = splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1");
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("a;b");
  });

  it("handles trailing content without semicolon", () => {
    const result = splitStatements("SELECT 1");
    expect(result).toHaveLength(1);
  });

  it("skips empty statements", () => {
    const result = splitStatements(";;SELECT 1;;");
    expect(result).toHaveLength(1);
  });
});

describe("detectDbType", () => {
  it("detects MySQL from backticks", () => {
    expect(detectDbType("CREATE TABLE `users` (`id` INT)")).toBe("mysql");
  });

  it("detects MySQL from AUTO_INCREMENT", () => {
    expect(detectDbType("id INT AUTO_INCREMENT")).toBe("mysql");
  });

  it("detects PostgreSQL from SERIAL", () => {
    expect(detectDbType('CREATE TABLE "users" (id SERIAL)')).toBe("postgresql");
  });

  it("detects PostgreSQL from UUID", () => {
    expect(detectDbType("id UUID DEFAULT gen_random_uuid()")).toBe("postgresql");
  });

  it("returns null for ambiguous SQL", () => {
    expect(detectDbType("CREATE TABLE t (id INT)")).toBeNull();
  });
});

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

  it("extracts UNIQUE constraints", () => {
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

describe("parseAlterTableFks", () => {
  it("parses ALTER TABLE ADD FOREIGN KEY", () => {
    const sql =
      "ALTER TABLE posts ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL";
    const fks = parseAlterTableFks(sql);
    expect(fks).toHaveLength(1);
    expect(fks[0].fromTable).toBe("posts");
    expect(fks[0].fromColumn).toBe("user_id");
    expect(fks[0].toTable).toBe("users");
    expect(fks[0].toColumn).toBe("id");
    expect(fks[0].onDelete).toBe("SET NULL");
  });

  it("parses ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY", () => {
    const sql =
      'ALTER TABLE "posts" ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id")';
    const fks = parseAlterTableFks(sql);
    expect(fks).toHaveLength(1);
    expect(fks[0].fromColumn).toBe("user_id");
  });

  it("returns empty for non-FK ALTER TABLE", () => {
    const fks = parseAlterTableFks("ALTER TABLE users ADD COLUMN age INT");
    expect(fks).toHaveLength(0);
  });
});

describe("resolveForeignKeys", () => {
  it("resolves FK references to table/column ids", () => {
    const usersResult = parseCreateTable("CREATE TABLE users (id INT PRIMARY KEY)");
    const postsResult = parseCreateTable("CREATE TABLE posts (id INT, user_id INT)");
    expect(usersResult).not.toBeNull();
    expect(postsResult).not.toBeNull();
    if (!usersResult || !postsResult) return;
    const tables = [usersResult.table, postsResult.table];
    const fks = [
      {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
        onDelete: "CASCADE" as const,
        onUpdate: "NO ACTION" as const,
      },
    ];
    const relations = resolveForeignKeys(tables, fks);
    expect(relations).toHaveLength(1);
    expect(relations[0].from.tableId).toBe(tables[1].id);
    expect(relations[0].to.tableId).toBe(tables[0].id);
    expect(relations[0].onDelete).toBe("CASCADE");
  });

  it("marks FK columns as isForeignKey", () => {
    const usersResult = parseCreateTable("CREATE TABLE users (id INT PRIMARY KEY)");
    const postsResult = parseCreateTable("CREATE TABLE posts (id INT, user_id INT)");
    expect(usersResult).not.toBeNull();
    expect(postsResult).not.toBeNull();
    if (!usersResult || !postsResult) return;
    const tables = [usersResult.table, postsResult.table];
    const fks = [
      {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
        onDelete: "NO ACTION" as const,
        onUpdate: "NO ACTION" as const,
      },
    ];
    resolveForeignKeys(tables, fks);
    const userIdCol = tables[1].columns.find((c) => c.name === "user_id");
    expect(userIdCol).toBeDefined();
    if (!userIdCol) return;
    expect(userIdCol.isForeignKey).toBe(true);
  });

  it("skips unresolved references", () => {
    const usersResult = parseCreateTable("CREATE TABLE users (id INT)");
    expect(usersResult).not.toBeNull();
    if (!usersResult) return;
    const tables = [usersResult.table];
    const fks = [
      {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
        onDelete: "NO ACTION" as const,
        onUpdate: "NO ACTION" as const,
      },
    ];
    const relations = resolveForeignKeys(tables, fks);
    expect(relations).toHaveLength(0);
  });

  it("uses case-insensitive matching", () => {
    const usersResult = parseCreateTable("CREATE TABLE Users (ID INT PRIMARY KEY)");
    const postsResult = parseCreateTable("CREATE TABLE Posts (id INT, user_id INT)");
    expect(usersResult).not.toBeNull();
    expect(postsResult).not.toBeNull();
    if (!usersResult || !postsResult) return;
    const tables = [usersResult.table, postsResult.table];
    const fks = [
      {
        fromTable: "posts",
        fromColumn: "USER_ID",
        toTable: "USERS",
        toColumn: "id",
        onDelete: "NO ACTION" as const,
        onUpdate: "NO ACTION" as const,
      },
    ];
    const relations = resolveForeignKeys(tables, fks);
    expect(relations).toHaveLength(1);
  });
});
