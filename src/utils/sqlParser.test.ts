import { describe, it, expect } from "vitest";
import { detectDbType, parseStatements, resolveForeignKeys } from "./sqlParser";
import { parseCreateTable } from "./sqlTables";
import { readDefault } from "./sqlDefaults";
import type { DbType } from "../types/schema";

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

  it("detects pg_dump output without quotes or casts", () => {
    expect(
      detectDbType(
        "SELECT pg_catalog.set_config('search_path', '', false);\nCREATE TABLE public.t (a integer);\nALTER TABLE public.t OWNER TO postgres;",
      ),
    ).toBe("postgresql");
  });

  it("returns null for ambiguous SQL", () => {
    expect(detectDbType("CREATE TABLE t (id INT)")).toBeNull();
  });
});

describe("ALTER TABLE", () => {
  const parse = (dialect: DbType | null, ...statements: string[]) =>
    parseStatements(
      [
        "CREATE TABLE users (id INT, email VARCHAR(255))",
        "CREATE TABLE posts (id INT, user_id INT, title VARCHAR(80), body TEXT)",
        ...statements,
      ],
      dialect,
    );
  const posts = (result: ReturnType<typeof parse>) => result.tables[1];

  it("adds a foreign key", () => {
    const { relations, tables } = parse(
      null,
      "ALTER TABLE posts ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL",
    );
    expect(relations).toHaveLength(1);
    expect(relations[0]).toMatchObject({
      from: { tableId: tables[1].id, columnId: tables[1].columns[1].id },
      to: { tableId: tables[0].id, columnId: tables[0].columns[0].id },
      onDelete: "SET NULL",
    });
  });

  it("adds a named foreign key", () => {
    const { relations } = parse(
      "postgresql",
      'ALTER TABLE ONLY public."posts" ADD CONSTRAINT "fk_user" FOREIGN KEY ("user_id") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE',
    );
    expect(relations[0]).toMatchObject({ onDelete: "CASCADE", onUpdate: "CASCADE" });
  });

  it("adds primary keys, unique constraints and indexes", () => {
    const result = parse(
      "postgresql",
      "ALTER TABLE ONLY public.posts ADD CONSTRAINT posts_pkey PRIMARY KEY (id)",
      "ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_key UNIQUE (email)",
      "ALTER TABLE ONLY public.posts ADD CONSTRAINT posts_user_title UNIQUE (user_id, title)",
    );
    const [id, userId, title] = posts(result).columns;
    expect(id).toMatchObject({ isPrimaryKey: true, isUnique: true, isNullable: false });
    expect(result.tables[0].columns[1].isUnique).toBe(true);
    expect(posts(result).indexes).toEqual([
      {
        id: expect.any(String),
        columnIds: [userId.id, title.id],
        unique: true,
        name: "posts_user_title",
      },
    ]);
  });

  it("turns pg_dump's sequence and identity defaults into serial columns", () => {
    const result = parse(
      "postgresql",
      "ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass)",
      "ALTER TABLE public.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public.users_id_seq START WITH 1)",
    );
    expect(posts(result).columns[0]).toMatchObject({
      type: "serial",
      isAutoIncrement: true,
      defaultValue: null,
    });
    expect(result.tables[0].columns[0]).toMatchObject({
      type: "serial",
      isAutoIncrement: true,
    });
  });

  it("sets defaults and ignores what it doesn't model", () => {
    const result = parse(
      "postgresql",
      "ALTER TABLE posts ALTER COLUMN title SET DEFAULT 'draft'::character varying",
      "ALTER TABLE public.posts OWNER TO postgres",
      "ALTER TABLE ONLY public.posts ADD COLUMN age INT",
    );
    expect(posts(result).columns[2]).toMatchObject({
      defaultValue: "draft",
      defaultKind: "value",
    });
    expect(posts(result).columns.map((c) => c.name)).toEqual([
      "id",
      "user_id",
      "title",
      "body",
      "age",
    ]);
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

describe("review cases", () => {
  it("detects the dialect from code, not from comments or strings", () => {
    const prisma =
      '/*\n  Warnings:\n  - You are about to drop the column `name` on the `User` table.\n  - The `role` column on the `User` table would be dropped.\n*/\nCREATE TABLE "User" ("id" SERIAL NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));';
    expect(detectDbType(prisma)).toBe("postgresql");
    const notes =
      'CREATE TABLE "t" ("id" SERIAL NOT NULL);\nCOMMENT ON TABLE "t" IS \'check `deleted_at`, never `DELETE`, see `x` and `y`\';';
    expect(detectDbType(notes)).toBe("postgresql");
  });

  it("keeps columns named period, exclude or like", () => {
    const { tables } = parseStatements(
      [
        "CREATE TABLE subscriptions (account_id int, period varchar(7) NOT NULL, exclude boolean, like text, plan text, PRIMARY KEY (account_id, period))",
      ],
      "postgresql",
    );
    const [account, period, exclude, like] = tables[0].columns;
    expect(tables[0].columns.map((c) => c.name)).toEqual([
      "account_id",
      "period",
      "exclude",
      "like",
      "plan",
    ]);
    expect([account.isPrimaryKey, period.isPrimaryKey, account.isUnique]).toEqual([
      true,
      true,
      false,
    ]);
    expect([exclude.type, like.type]).toEqual(["boolean", "text"]);
  });

  it("keeps the parentheses PostgreSQL needs around an expression default", () => {
    expect(readDefault("(now() AT TIME ZONE 'utc'::text)", "postgresql")).toEqual({
      value: "(now() AT TIME ZONE 'utc'::text)",
      kind: "expression",
    });
  });

  it("keeps two tables of the same name in different schemas apart", () => {
    const { tables, relations } = parseStatements(
      [
        "CREATE TABLE auth.users (id uuid NOT NULL, email text)",
        "CREATE TABLE public.users (id uuid NOT NULL, name text)",
        "CREATE TABLE public.profiles (id uuid, user_id uuid, auth_id uuid)",
        "ALTER TABLE ONLY auth.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)",
        "ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)",
        "CREATE INDEX users_name_idx ON public.users USING btree (name)",
        "ALTER TABLE ONLY public.profiles ADD CONSTRAINT p_user FOREIGN KEY (user_id) REFERENCES public.users(id)",
        "ALTER TABLE ONLY public.profiles ADD CONSTRAINT p_auth FOREIGN KEY (auth_id) REFERENCES auth.users(id)",
      ],
      "postgresql",
    );
    const [auth, users, profiles] = tables;
    expect(tables.map((t) => t.name)).toEqual(["auth_users", "users", "profiles"]);
    expect(auth.columns[0].isPrimaryKey).toBe(true);
    expect(users.columns[0].isPrimaryKey).toBe(true);
    expect(users.indexes?.map((i) => i.columnIds)).toEqual([[users.columns[1].id]]);
    expect(relations.map((r) => [r.from.columnId, r.to.tableId])).toEqual([
      [profiles.columns[1].id, users.id],
      [profiles.columns[2].id, auth.id],
    ]);
  });

  it("does not read clauses as columns", () => {
    const pg = parseStatements(
      [
        "CREATE TABLE profiles (id int, a int, b int, CONSTRAINT ab UNIQUE NULLS NOT DISTINCT (a, b), UNIQUE NULLS DISTINCT (b, id))",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text",
      ],
      "postgresql",
    );
    expect(pg.tables[0].columns.map((c) => c.name)).toEqual(["id", "a", "b", "bio"]);
    expect(pg.tables[0].columns[3].type).toBe("text");
    expect(pg.tables[0].indexes?.map((i) => [i.unique, i.name ?? null])).toEqual([
      [true, "ab"],
      [true, null],
    ]);
    const my = parseStatements(
      [
        "CREATE TABLE t (uuid char(36), date date, UNIQUE KEY uuid (uuid), KEY date (date))",
      ],
      "mysql",
    );
    expect(my.tables[0].columns.map((c) => c.name)).toEqual(["uuid", "date"]);
    expect(my.tables[0].columns[0].isUnique).toBe(true);
    expect(my.tables[0].indexes?.map((i) => i.name)).toEqual(["date"]);
  });

  it("references the primary key when REFERENCES names no column", () => {
    const { tables, relations } = parseStatements(
      [
        "CREATE TABLE authors (id int PRIMARY KEY)",
        "CREATE TABLE pairs (a int, b int, PRIMARY KEY (a, b))",
        "CREATE TABLE books (author_id int REFERENCES authors, x int, y int, FOREIGN KEY (x, y) REFERENCES pairs)",
      ],
      "postgresql",
    );
    const [authors, pairs, books] = tables;
    expect(relations.map((r) => [r.from.columnId, r.to.columnId])).toEqual([
      [books.columns[0].id, authors.columns[0].id],
      [books.columns[1].id, pairs.columns[0].id],
      [books.columns[2].id, pairs.columns[1].id],
    ]);
  });

  it("applies phpMyAdmin's MODIFY and CHANGE", () => {
    const { tables } = parseStatements(
      [
        "CREATE TABLE `t` (`id` int(11) NOT NULL, `old` varchar(10) DEFAULT NULL)",
        "ALTER TABLE `t` ADD PRIMARY KEY (`id`)",
        "ALTER TABLE `t` MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, CHANGE `old` `name` varchar(40) NOT NULL DEFAULT 'x'",
      ],
      "mysql",
    );
    const [id, name] = tables[0].columns;
    expect(id).toMatchObject({
      isPrimaryKey: true,
      isAutoIncrement: true,
      isUnique: true,
    });
    expect(name).toMatchObject({
      name: "name",
      length: 40,
      isNullable: false,
      defaultValue: "x",
    });
  });

  it("reads PostgreSQL E'' strings and qualified operator classes", () => {
    const { tables } = parseStatements(
      [
        String.raw`CREATE TABLE t (a text DEFAULT E'it\'s\n', b text)`,
        "CREATE INDEX t_b_trgm ON public.t USING gin (b public.gin_trgm_ops)",
        "CREATE TABLE after_e (id int)",
      ],
      "postgresql",
    );
    expect(tables.map((t) => t.name)).toEqual(["t", "after_e"]);
    expect(tables[0].columns[0]).toMatchObject({
      defaultValue: "it's\n",
      defaultKind: "value",
    });
    expect(tables[0].indexes?.map((i) => i.name)).toEqual(["t_b_trgm"]);
  });

  it("copies columns from LIKE", () => {
    const { tables } = parseStatements(
      [
        "CREATE TABLE a (id int PRIMARY KEY, name text DEFAULT 'x')",
        "CREATE TABLE b (LIKE a INCLUDING ALL, extra int)",
        "CREATE TABLE c (LIKE a)",
      ],
      "postgresql",
    );
    expect(
      tables[1].columns.map((c) => [c.name, c.isPrimaryKey, c.defaultValue]),
    ).toEqual([
      ["id", true, null],
      ["name", false, "x"],
      ["extra", false, null],
    ]);
    expect(
      tables[2].columns.map((c) => [c.name, c.isPrimaryKey, c.defaultValue]),
    ).toEqual([
      ["id", false, null],
      ["name", false, null],
    ]);
    expect(
      new Set([...tables[1].columns, ...tables[0].columns].map((c) => c.id)).size,
    ).toBe(5);
  });
});

describe("second review cases", () => {
  it("keeps foreign keys on a column renamed by CHANGE", () => {
    const { tables, relations } = parseStatements(
      [
        "CREATE TABLE `roles` (`id` int PRIMARY KEY)",
        "CREATE TABLE `users` (`id` int PRIMARY KEY, `role` int, FOREIGN KEY (`role`) REFERENCES `roles` (`id`))",
        "ALTER TABLE `users` CHANGE `role` `role_id` int",
        "ALTER TABLE `roles` CHANGE `id` `role_pk` int",
      ],
      "mysql",
    );
    const [roles, users] = tables;
    expect(relations.map((r) => [r.from.columnId, r.to.columnId])).toEqual([
      [users.columns[1].id, roles.columns[0].id],
    ]);
    expect([users.columns[1].name, roles.columns[0].name]).toEqual([
      "role_id",
      "role_pk",
    ]);
  });

  it("reads MySQL SERIAL as an unsigned auto-increment bigint", () => {
    const { tables } = parseStatements(
      ["CREATE TABLE `s` (`id` SERIAL PRIMARY KEY)"],
      "mysql",
    );
    expect(tables[0].columns[0]).toMatchObject({
      type: "bigint",
      unsigned: true,
      isAutoIncrement: true,
      isNullable: false,
      isUnique: true,
    });
  });

  it("does not add a column or a table twice", () => {
    const { tables, attempted } = parseStatements(
      [
        "CREATE TABLE IF NOT EXISTS t (id integer PRIMARY KEY, a text)",
        "ALTER TABLE t ADD COLUMN IF NOT EXISTS a text",
        "ALTER TABLE t ADD COLUMN IF NOT EXISTS b text",
        "CREATE TABLE IF NOT EXISTS t (id integer PRIMARY KEY, other text)",
      ],
      "postgresql",
    );
    expect(tables.map((t) => t.name)).toEqual(["t"]);
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "a", "b"]);
    expect(attempted).toBe(1);
  });

  it("lets a table created again after a drop replace the first one", () => {
    const { tables } = parseStatements(
      ["CREATE TABLE t (id int)", "DROP TABLE t", "CREATE TABLE t (id int, name text)"],
      "postgresql",
    );
    expect(tables.map((t) => [t.name, t.columns.length])).toEqual([["t", 2]]);
  });

  it("keeps one enum when MODIFY redefines an enum column", () => {
    const { enums, tables } = parseStatements(
      [
        "CREATE TABLE `users` (`status` enum('a','b'))",
        "ALTER TABLE `users` MODIFY `status` enum('a','b','c')",
      ],
      "mysql",
    );
    expect(enums.map((e) => [e.name, e.values])).toEqual([
      ["users_status", ["a", "b", "c"]],
    ]);
    expect(tables[0].columns[0].enumId).toBe(enums[0].id);
  });

  it("follows the primary key's own order when REFERENCES names no column", () => {
    const { tables, relations } = parseStatements(
      [
        "CREATE TABLE a (x int, y int, PRIMARY KEY (y, x))",
        "CREATE TABLE b (ay int, ax int, FOREIGN KEY (ay, ax) REFERENCES a)",
      ],
      "postgresql",
    );
    const [a, b] = tables;
    expect(relations.map((r) => [r.from.columnId, r.to.columnId])).toEqual([
      [b.columns[0].id, a.columns[1].id],
      [b.columns[1].id, a.columns[0].id],
    ]);
  });

  it("detects MySQL despite an apostrophe in a # comment", () => {
    expect(
      detectDbType(
        "# don't\nCREATE TABLE `a` (`id` int AUTO_INCREMENT PRIMARY KEY, `s` varchar(3) DEFAULT 'x') ENGINE=InnoDB;",
      ),
    ).toBe("mysql");
  });
});

describe("third review cases", () => {
  it("ignores everything a repeated CREATE TABLE IF NOT EXISTS would bring", () => {
    const statement =
      "CREATE TABLE IF NOT EXISTS t (st enum('a','b'), g geometrycollectionz)";
    const { enums, issues } = parseStatements([statement, statement], "mysql");
    expect(enums.map((e) => e.name)).toEqual(["t_st"]);
    expect(issues).toHaveLength(1);
  });

  it("does not leave an enum behind for a column that already exists", () => {
    const { enums } = parseStatements(
      [
        "CREATE TABLE t (st enum('a','b'))",
        "ALTER TABLE t ADD COLUMN IF NOT EXISTS st enum('a','b')",
      ],
      "mysql",
    );
    expect(enums.map((e) => e.name)).toEqual(["t_st"]);
  });

  it("forgets a dropped table, its enums, its issues and what was altered before", () => {
    const { tables, enums, issues } = parseStatements(
      [
        "CREATE TABLE t (id int, st enum('a','b'), w weird, CHECK (id > 0))",
        "ALTER TABLE t ADD COLUMN legacy int",
        "DROP TABLE IF EXISTS t",
        "CREATE TABLE t (id int, st enum('x','y'))",
      ],
      "mysql",
    );
    expect(tables[0].columns.map((c) => c.name)).toEqual(["id", "st"]);
    expect(enums.map((e) => e.values)).toEqual([["x", "y"]]);
    expect(tables[0].columns[1].enumId).toBe(enums[0].id);
    expect(issues).toEqual([]);
  });

  it("keeps the tables of each database in a multi-database dump", () => {
    const { tables, relations } = parseStatements(
      [
        "USE `a`",
        "DROP TABLE IF EXISTS `users`",
        "CREATE TABLE `users` (`id` int PRIMARY KEY, `a_only` int UNIQUE)",
        "CREATE TABLE `posts` (`id` int, `author` int, FOREIGN KEY (`author`) REFERENCES `users` (`a_only`))",
        "USE `b`",
        "DROP TABLE IF EXISTS `users`",
        "CREATE TABLE `users` (`id` int PRIMARY KEY, `b_only` int)",
      ],
      "mysql",
    );
    expect(tables.map((t) => t.name)).toEqual(["users", "posts", "b_users"]);
    expect(relations.map((r) => [r.from.tableId, r.to.columnId])).toEqual([
      [tables[1].id, tables[0].columns[1].id],
    ]);
  });

  it("drops the enum of a column MODIFY turns into text", () => {
    const { enums } = parseStatements(
      [
        "CREATE TABLE users (status enum('a','b'))",
        "ALTER TABLE users MODIFY status varchar(20)",
      ],
      "mysql",
    );
    expect(enums).toEqual([]);
  });

  it("keeps a PostgreSQL enum type no column uses", () => {
    const { enums } = parseStatements(
      ["CREATE TYPE mood AS ENUM ('a')", "CREATE TABLE t (id int)"],
      "postgresql",
    );
    expect(enums.map((e) => e.name)).toEqual(["mood"]);
  });
});

describe("fourth review cases", () => {
  it("does not count a dropped table as one that could not be read", () => {
    const { tables, attempted } = parseStatements(
      [
        "CREATE TABLE public.customer (id int)",
        "CREATE TABLE public.old_audit (id int)",
        "DROP TABLE public.old_audit",
        "CREATE TABLE public.orders (id int)",
        "CREATE TABLE broken",
      ],
      "postgresql",
    );
    expect(tables.map((t) => t.name)).toEqual(["customer", "orders"]);
    expect(attempted - tables.length).toBe(1);
  });

  it("names the renamed table in its issues", () => {
    const { issues } = parseStatements(
      [
        "CREATE TABLE auth.users (id uuid, confirmed_at timestamptz GENERATED ALWAYS AS (now()) STORED)",
        "CREATE TABLE public.users (id uuid)",
      ],
      "postgresql",
    );
    expect(issues).toEqual([
      { kind: "generatedColumn", table: "auth_users", column: "confirmed_at" },
    ]);
  });

  it("keeps the foreign keys of a second table of the same name", () => {
    const { tables, relations } = parseStatements(
      [
        "CREATE TABLE b (id int)",
        "CREATE TABLE a (id int PRIMARY KEY)",
        "CREATE TABLE b (id int, a_id int REFERENCES a(id))",
      ],
      "postgresql",
    );
    expect(tables.map((t) => t.name)).toEqual(["b", "a", "b_2"]);
    expect(relations.map((r) => r.from.tableId)).toEqual([tables[2].id]);
  });

  it("names MySQL enums after their final table", () => {
    const recreated = parseStatements(
      ["CREATE TABLE t (st enum('a'))", "DROP TABLE t", "CREATE TABLE t (st enum('b'))"],
      "mysql",
    );
    expect(recreated.enums.map((e) => e.name)).toEqual(["t_st"]);
    const twoDatabases = parseStatements(
      [
        "USE a",
        "CREATE TABLE users (st enum('a'))",
        "USE b",
        "CREATE TABLE users (st enum('b'))",
      ],
      "mysql",
    );
    expect(twoDatabases.enums.map((e) => e.name)).toEqual(["users_st", "b_users_st"]);
  });
});
