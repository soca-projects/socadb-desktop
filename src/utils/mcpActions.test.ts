import { describe, it, expect, beforeEach } from "vitest";
import { dispatchMcpAction } from "./mcpActions";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";

function resetStore(dbType: "mysql" | "postgresql" = "postgresql") {
  useSchemaStore.setState({
    schema: createEmptySchema("test", dbType),
    filePath: null,
    savedAt: null,
  });
}

describe("dispatchMcpAction", () => {
  beforeEach(() => resetStore());

  describe("get_schema", () => {
    it("returns empty schema", async () => {
      const result = await dispatchMcpAction("get_schema", {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as {
        name: string;
        tables: unknown[];
        relations: unknown[];
      };
      expect(data.name).toBe("test");
      expect(data.tables).toHaveLength(0);
      expect(data.relations).toHaveLength(0);
    });
  });

  describe("create_table", () => {
    it("creates a table with default columns", async () => {
      const result = await dispatchMcpAction("create_table", { name: "users" });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.tables).toHaveLength(1);
      expect(schema.tables[0].name).toBe("users");
      expect(schema.tables[0].columns.length).toBeGreaterThan(0);
    });

    it("creates a table with custom columns", async () => {
      const result = await dispatchMcpAction("create_table", {
        name: "users",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "email", type: "varchar" },
        ],
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.tables[0].columns).toHaveLength(2);
      expect(schema.tables[0].columns[0].name).toBe("id");
      expect(schema.tables[0].columns[1].name).toBe("email");
    });

    it("fails on missing name", async () => {
      const result = await dispatchMcpAction("create_table", {});
      expect(result.ok).toBe(false);
    });

    it("refuses a type the database lacks, listing the valid ones", async () => {
      const result = await dispatchMcpAction("create_table", {
        name: "test",
        columns: [{ name: "col", type: "INVALID_TYPE" }],
      });
      expect(result).toMatchObject({ ok: false });
      if (result.ok) return;
      expect(result.error).toContain("PostgreSQL");
      expect(result.error).toContain("timestamptz");
      expect(useSchemaStore.getState().schema.tables).toHaveLength(0);
    });
  });

  describe("get_table", () => {
    it("returns table data", async () => {
      await dispatchMcpAction("create_table", { name: "users" });
      const result = await dispatchMcpAction("get_table", { name: "users" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as { name: string };
      expect(data.name).toBe("users");
    });

    it("returns null for missing table", async () => {
      const result = await dispatchMcpAction("get_table", { name: "missing" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toBeNull();
    });

    it("fails on missing name param", async () => {
      const result = await dispatchMcpAction("get_table", {});
      expect(result.ok).toBe(false);
    });
  });

  describe("update_table", () => {
    it("renames a table", async () => {
      await dispatchMcpAction("create_table", { name: "users" });
      const result = await dispatchMcpAction("update_table", {
        name: "users",
        newName: "accounts",
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.tables[0].name).toBe("accounts");
    });

    it("returns false for missing table", async () => {
      const result = await dispatchMcpAction("update_table", {
        name: "missing",
        newName: "x",
      });
      expect(result).toEqual({ ok: true, data: false });
    });
  });

  describe("delete_table", () => {
    it("deletes a table", async () => {
      await dispatchMcpAction("create_table", { name: "users" });
      const result = await dispatchMcpAction("delete_table", { name: "users" });
      expect(result.ok).toBe(true);
      expect(useSchemaStore.getState().schema.tables).toHaveLength(0);
    });

    it("returns false for missing table", async () => {
      const result = await dispatchMcpAction("delete_table", { name: "missing" });
      expect(result).toEqual({ ok: true, data: false });
    });
  });

  describe("add_column", () => {
    it("adds a column to a table", async () => {
      await dispatchMcpAction("create_table", { name: "users" });
      const result = await dispatchMcpAction("add_column", {
        table: "users",
        column: { name: "email", type: "varchar" },
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      const emailCol = schema.tables[0].columns.find((c) => c.name === "email");
      expect(emailCol).toBeDefined();
      if (!emailCol) return;
      expect(emailCol.type).toBe("varchar");
    });

    it("fails on missing params", async () => {
      const result = await dispatchMcpAction("add_column", {});
      expect(result.ok).toBe(false);
    });
  });

  describe("update_column", () => {
    it("updates column properties", async () => {
      await dispatchMcpAction("create_table", {
        name: "users",
        columns: [{ name: "email", type: "varchar" }],
      });
      const result = await dispatchMcpAction("update_column", {
        table: "users",
        column: "email",
        updates: { isUnique: true },
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.tables[0].columns[0].isUnique).toBe(true);
    });

    it("drops a default kind picked for the previous default", async () => {
      await dispatchMcpAction("create_table", {
        name: "users",
        columns: [{ name: "role", type: "varchar" }],
      });
      const { schema } = useSchemaStore.getState();
      const table = schema.tables[0];
      useSchemaStore.getState().updateColumn(table.id, table.columns[0].id, {
        defaultValue: "reader",
        defaultKind: "value",
      });
      await dispatchMcpAction("update_column", {
        table: "users",
        column: "role",
        updates: { defaultValue: "'{}'::jsonb" },
      });
      expect(
        useSchemaStore.getState().schema.tables[0].columns[0].defaultKind,
      ).toBeUndefined();
    });

    it("keeps the default kind when the agent repeats the same default", async () => {
      await dispatchMcpAction("create_table", {
        name: "users",
        columns: [{ name: "created_by", type: "varchar" }],
      });
      const table = useSchemaStore.getState().schema.tables[0];
      useSchemaStore.getState().updateColumn(table.id, table.columns[0].id, {
        defaultValue: "CURRENT_USER",
        defaultKind: "expression",
      });
      await dispatchMcpAction("update_column", {
        table: "users",
        column: "created_by",
        updates: { isNullable: false, defaultValue: "CURRENT_USER" },
      });
      expect(useSchemaStore.getState().schema.tables[0].columns[0].defaultKind).toBe(
        "expression",
      );
    });
  });

  describe("delete_column", () => {
    it("deletes a column", async () => {
      await dispatchMcpAction("create_table", {
        name: "users",
        columns: [
          { name: "id", type: "uuid" },
          { name: "email", type: "varchar" },
        ],
      });
      const result = await dispatchMcpAction("delete_column", {
        table: "users",
        column: "email",
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.tables[0].columns).toHaveLength(1);
    });
  });

  describe("create_relation", () => {
    beforeEach(async () => {
      await dispatchMcpAction("create_table", {
        name: "users",
        columns: [{ name: "id", type: "uuid", isPrimaryKey: true }],
      });
      await dispatchMcpAction("create_table", {
        name: "posts",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "user_id", type: "uuid" },
        ],
      });
    });

    it("creates a relation", async () => {
      const result = await dispatchMcpAction("create_relation", {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.relations).toHaveLength(1);
      expect(schema.relations[0].type).toBe("1:N");
    });

    it("accepts custom relation type", async () => {
      await dispatchMcpAction("create_relation", {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
        type: "1:1",
      });
      const { schema } = useSchemaStore.getState();
      expect(schema.relations[0].type).toBe("1:1");
    });

    it("returns false for missing table", async () => {
      const result = await dispatchMcpAction("create_relation", {
        fromTable: "missing",
        fromColumn: "x",
        toTable: "users",
        toColumn: "id",
      });
      expect(result).toEqual({ ok: true, data: false });
    });
  });

  describe("delete_relation", () => {
    it("deletes an existing relation", async () => {
      await dispatchMcpAction("create_table", {
        name: "users",
        columns: [{ name: "id", type: "uuid" }],
      });
      await dispatchMcpAction("create_table", {
        name: "posts",
        columns: [{ name: "user_id", type: "uuid" }],
      });
      await dispatchMcpAction("create_relation", {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
      });
      const result = await dispatchMcpAction("delete_relation", {
        fromTable: "posts",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
      });
      expect(result.ok).toBe(true);
      expect(useSchemaStore.getState().schema.relations).toHaveLength(0);
    });
  });

  describe("unknown action", () => {
    it("returns error for unknown action", async () => {
      const result = await dispatchMcpAction("unknown_action", {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unknown action");
      }
    });
  });
});

describe("what the agent writes beyond names and types", () => {
  beforeEach(() => resetStore());
  const table = (name: string) => {
    const found = useSchemaStore.getState().schema.tables.find((t) => t.name === name);
    if (!found) throw new Error(`no table ${name}`);
    return found;
  };
  const column = (tableName: string, name: string) => {
    const found = table(tableName).columns.find((c) => c.name === name);
    if (!found) throw new Error(`no column ${name}`);
    return found;
  };
  const enumOf = (tableName: string, name: string) =>
    useSchemaStore
      .getState()
      .schema.enums?.find((e) => e.id === column(tableName, name).enumId);

  it("reads types as SQL writes them, per database", async () => {
    resetStore("postgresql");
    await dispatchMcpAction("create_table", {
      name: "items",
      columns: [
        { name: "title", type: "varchar(120)" },
        { name: "price", type: "NUMERIC(10, 2)" },
        { name: "count", type: "int" },
        { name: "label", type: "character varying", length: 40 },
      ],
    });
    expect(column("items", "title")).toMatchObject({ type: "varchar", length: 120 });
    expect(column("items", "price")).toMatchObject({
      type: "numeric",
      precision: 10,
      scale: 2,
    });
    expect(column("items", "count").type).toBe("integer");
    expect(column("items", "label")).toMatchObject({ type: "varchar", length: 40 });

    resetStore("mysql");
    await dispatchMcpAction("create_table", {
      name: "items",
      columns: [{ name: "count", type: "int unsigned" }],
    });
    expect(column("items", "count")).toMatchObject({ type: "int", unsigned: true });
    const refused = await dispatchMcpAction("add_column", {
      table: "items",
      column: { name: "token", type: "uuid" },
    });
    expect(refused).toMatchObject({ ok: false });
  });

  it("writes notes on tables and columns, and removes them with null", async () => {
    await dispatchMcpAction("create_table", {
      name: "users",
      note: "Everyone who signed up.",
      columns: [{ name: "email", type: "varchar", note: "Login." }],
    });
    expect(table("users").note).toBe("Everyone who signed up.");
    expect(column("users", "email").note).toBe("Login.");
    await dispatchMcpAction("update_table", { name: "users", note: null });
    await dispatchMcpAction("update_column", {
      table: "users",
      column: "email",
      updates: { note: null },
    });
    expect(table("users").note).toBeUndefined();
    expect(column("users", "email").note).toBeUndefined();
  });

  it("keeps the default kind the agent gives", async () => {
    await dispatchMcpAction("create_table", {
      name: "events",
      columns: [
        {
          name: "at",
          type: "timestamp",
          defaultValue: "now()",
          defaultKind: "expression",
        },
      ],
    });
    expect(column("events", "at").defaultKind).toBe("expression");
    await dispatchMcpAction("update_column", {
      table: "events",
      column: "at",
      updates: { defaultValue: "pending", defaultKind: "value" },
    });
    expect(column("events", "at")).toMatchObject({
      defaultValue: "pending",
      defaultKind: "value",
    });
  });

  it("creates MySQL enums from ENUM(...) or enumValues", async () => {
    resetStore("mysql");
    await dispatchMcpAction("create_table", {
      name: "posts",
      columns: [
        { name: "status", type: "enum('draft','published')", defaultValue: "draft" },
        { name: "mood", enumValues: ["calm", "busy"], enumName: "ignored" },
      ],
    });
    expect(enumOf("posts", "status")?.values).toEqual(["draft", "published"]);
    expect(column("posts", "status")).toMatchObject({
      type: "enum",
      defaultValue: "draft",
    });
    expect(enumOf("posts", "mood")).toMatchObject({
      name: "posts_mood",
      values: ["calm", "busy"],
    });
  });

  it("names PostgreSQL enums and lets columns share one by name", async () => {
    await dispatchMcpAction("create_table", {
      name: "posts",
      columns: [
        {
          name: "status",
          type: "enum",
          enumName: "post_status",
          enumValues: ["draft", "live"],
        },
      ],
    });
    await dispatchMcpAction("create_table", {
      name: "drafts",
      columns: [{ name: "status", type: "enum", enumName: "post_status" }],
    });
    const shared = enumOf("posts", "status");
    expect(shared).toMatchObject({ name: "post_status", values: ["draft", "live"] });
    expect(column("drafts", "status").enumId).toBe(shared?.id);
    expect(useSchemaStore.getState().schema.enums).toHaveLength(1);

    await dispatchMcpAction("update_column", {
      table: "drafts",
      column: "status",
      updates: { enumValues: ["draft", "live", "archived"] },
    });
    expect(enumOf("posts", "status")?.values).toEqual(["draft", "live", "archived"]);
  });

  it("drops an enum no column uses once the column changes type", async () => {
    await dispatchMcpAction("create_table", {
      name: "posts",
      columns: [{ name: "status", enumValues: ["a", "b"] }],
    });
    await dispatchMcpAction("update_column", {
      table: "posts",
      column: "status",
      updates: { type: "varchar(20)" },
    });
    expect(column("posts", "status")).toMatchObject({ type: "varchar", length: 20 });
    expect(useSchemaStore.getState().schema.enums ?? []).toHaveLength(0);
  });

  it("shows notes, enums and indexes in get_table", async () => {
    await dispatchMcpAction("create_table", {
      name: "posts",
      note: "Articles.",
      columns: [
        { name: "title", type: "varchar(80)" },
        { name: "status", enumName: "post_status", enumValues: ["draft"] },
      ],
    });
    await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["title", "status"],
    });
    const result = await dispatchMcpAction("get_table", { name: "posts" });
    expect(result).toMatchObject({
      ok: true,
      data: {
        note: "Articles.",
        columns: [
          { name: "title", length: 80 },
          { name: "status", enum: { name: "post_status", values: ["draft"] } },
        ],
        indexes: [
          { name: "posts_title_status_idx", columns: ["title", "status"], unique: false },
        ],
      },
    });
  });
});

describe("add_index and delete_index", () => {
  beforeEach(async () => {
    resetStore("mysql");
    await dispatchMcpAction("create_table", {
      name: "posts",
      columns: [
        { name: "id", type: "int", isPrimaryKey: true },
        { name: "author_id", type: "int" },
        { name: "slug", type: "varchar(80)" },
        { name: "body", type: "text" },
      ],
    });
  });
  const posts = () => useSchemaStore.getState().schema.tables[0];

  it("adds an index on several columns and deletes it by its derived name", async () => {
    const added = await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["author_id", "slug"],
      unique: true,
    });
    expect(added).toEqual({ ok: true, data: "index" });
    expect(posts().indexes).toEqual([
      {
        id: expect.any(String),
        columnIds: [posts().columns[1].id, posts().columns[2].id],
        unique: true,
      },
    ]);
    const deleted = await dispatchMcpAction("delete_index", {
      table: "posts",
      name: "posts_author_id_slug_key",
    });
    expect(deleted).toEqual({ ok: true, data: true });
    expect(posts().indexes).toEqual([]);
  });

  it("makes a one-column unique index the column's UNIQUE flag", async () => {
    const result = await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["slug"],
      unique: true,
    });
    expect(result).toEqual({ ok: true, data: "column" });
    expect(posts().columns[2].isUnique).toBe(true);
    expect(posts().indexes ?? []).toEqual([]);
  });

  it("refuses columns the database can't index, unknown columns and taken names", async () => {
    const text = await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["body"],
    });
    expect(text).toMatchObject({ ok: false });
    const missing = await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["nope"],
    });
    expect(missing).toMatchObject({ ok: false });
    await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["slug"],
      name: "by_slug",
    });
    const taken = await dispatchMcpAction("add_index", {
      table: "posts",
      columns: ["author_id"],
      name: "by_slug",
    });
    expect(taken).toMatchObject({ ok: false });
    const unknown = await dispatchMcpAction("delete_index", {
      table: "posts",
      name: "nope",
    });
    expect(unknown).toEqual({ ok: true, data: false });
  });
});

describe("primary keys the agent creates", () => {
  beforeEach(() => resetStore());
  const columns = () => useSchemaStore.getState().schema.tables[0].columns;

  it("are not null, and unique when they are the only key column", async () => {
    await dispatchMcpAction("create_table", {
      name: "loans",
      columns: [
        { name: "id", type: "uuid", isPrimaryKey: true },
        { name: "note", type: "text" },
      ],
    });
    expect(columns()[0]).toMatchObject({ isNullable: false, isUnique: true });
    expect(columns()[1]).toMatchObject({ isNullable: true, isUnique: false });
  });

  it("are not unique one by one in a composite key", async () => {
    await dispatchMcpAction("create_table", {
      name: "pairs",
      columns: [
        { name: "a", type: "integer", isPrimaryKey: true },
        { name: "b", type: "integer", isPrimaryKey: true },
      ],
    });
    expect(columns().map((c) => [c.isNullable, c.isUnique])).toEqual([
      [false, false],
      [false, false],
    ]);
    await dispatchMcpAction("add_column", {
      table: "pairs",
      column: { name: "c", type: "integer", isPrimaryKey: true },
    });
    expect(columns()[2]).toMatchObject({ isNullable: false, isUnique: false });
  });

  it("become not null when update_column makes them a key", async () => {
    await dispatchMcpAction("create_table", {
      name: "t",
      columns: [{ name: "code", type: "varchar(8)" }],
    });
    await dispatchMcpAction("update_column", {
      table: "t",
      column: "code",
      updates: { isPrimaryKey: true },
    });
    expect(columns()[0]).toMatchObject({ isPrimaryKey: true, isNullable: false });
  });
});

describe("agent review cases", () => {
  beforeEach(() => resetStore());
  const schema = () => useSchemaStore.getState().schema;
  const column = (tableName: string, name: string) => {
    const found = schema()
      .tables.find((t) => t.name === tableName)
      ?.columns.find((c) => c.name === name);
    if (!found) throw new Error(`no column ${tableName}.${name}`);
    return found;
  };
  const enumOf = (tableName: string, name: string) =>
    schema().enums?.find((e) => e.id === column(tableName, name).enumId);

  it("splits a column off a shared enum when it gets a new name", async () => {
    for (const name of ["a", "b"]) {
      await dispatchMcpAction("create_table", {
        name,
        columns: [
          { name: "s", enumName: "status", enumValues: ["x", "y"], defaultValue: "x" },
        ],
      });
    }
    await dispatchMcpAction("update_column", {
      table: "b",
      column: "s",
      updates: { enumName: "b_status", enumValues: ["m", "n"] },
    });
    expect(enumOf("a", "s")).toMatchObject({ name: "status", values: ["x", "y"] });
    expect(column("a", "s").defaultValue).toBe("x");
    expect(enumOf("b", "s")).toMatchObject({ name: "b_status", values: ["m", "n"] });
  });

  it("makes one undo step of one agent call", async () => {
    useSchemaStore.temporal.getState().clear();
    const before = useSchemaStore.temporal.getState().pastStates.length;
    await dispatchMcpAction("create_table", {
      name: "posts",
      note: "Articles.",
      columns: [
        { name: "status", enumName: "post_status", enumValues: ["draft"] },
        { name: "kind", enumName: "post_kind", enumValues: ["a"] },
      ],
    });
    expect(useSchemaStore.temporal.getState().pastStates.length).toBe(before + 1);
    useSchemaStore.temporal.getState().undo();
    expect(schema().tables).toHaveLength(0);
    expect(schema().enums ?? []).toHaveLength(0);
  });

  it("applies the editor's rules when the agent changes a type", async () => {
    resetStore("mysql");
    await dispatchMcpAction("create_table", { name: "a" });
    await dispatchMcpAction("update_column", {
      table: "a",
      column: "id",
      updates: { type: "varchar(36)" },
    });
    expect(column("a", "id")).toMatchObject({
      type: "varchar",
      length: 36,
      isAutoIncrement: false,
    });
    await dispatchMcpAction("add_column", {
      table: "a",
      column: { name: "code", type: "varchar(10)", isAutoIncrement: true },
    });
    expect(column("a", "code").isAutoIncrement).toBe(false);
  });

  it("drops a default the shared enum doesn't allow", async () => {
    await dispatchMcpAction("create_table", {
      name: "a",
      columns: [{ name: "s", enumName: "st", enumValues: ["x", "y"] }],
    });
    await dispatchMcpAction("create_table", {
      name: "b",
      columns: [{ name: "s", enumValues: ["p", "q"], defaultValue: "p" }],
    });
    await dispatchMcpAction("update_column", {
      table: "b",
      column: "s",
      updates: { enumName: "st" },
    });
    expect(column("b", "s")).toMatchObject({
      enumId: enumOf("a", "s")?.id,
      defaultValue: null,
    });
  });

  it("reads enumName alone as an enum in PostgreSQL and ignores it in MySQL", async () => {
    await dispatchMcpAction("create_table", {
      name: "orders",
      columns: [{ name: "status", enumName: "order_status", enumValues: ["new"] }],
    });
    await dispatchMcpAction("add_column", {
      table: "orders",
      column: { name: "previous", enumName: "order_status" },
    });
    expect(column("orders", "previous").enumId).toBe(enumOf("orders", "status")?.id);

    resetStore("mysql");
    await dispatchMcpAction("create_table", {
      name: "a",
      columns: [{ name: "s", type: "varchar(20)", defaultValue: "zz" }],
    });
    await dispatchMcpAction("update_column", {
      table: "a",
      column: "s",
      updates: { enumName: "whatever" },
    });
    expect(column("a", "s")).toMatchObject({ type: "varchar", defaultValue: "zz" });
  });

  it("refuses a column listed twice and an index that already exists", async () => {
    await dispatchMcpAction("create_table", {
      name: "u",
      columns: [
        { name: "email", type: "varchar(80)" },
        { name: "name", type: "text" },
      ],
    });
    const twice = await dispatchMcpAction("add_index", {
      table: "u",
      columns: ["email", "email"],
    });
    expect(twice).toMatchObject({ ok: false });
    await dispatchMcpAction("add_index", { table: "u", columns: ["email", "name"] });
    const again = await dispatchMcpAction("add_index", {
      table: "u",
      columns: ["email", "name"],
    });
    expect(again).toMatchObject({ ok: false });
  });

  it("refuses repeated enum values and reads double-quoted ones", async () => {
    const repeated = await dispatchMcpAction("create_table", {
      name: "a",
      columns: [{ name: "s", enumValues: ["x", "x"] }],
    });
    expect(repeated).toMatchObject({ ok: false });
    await dispatchMcpAction("create_table", {
      name: "b",
      columns: [{ name: "s", type: 'enum("a","b")' }],
    });
    expect(enumOf("b", "s")?.values).toEqual(["a", "b"]);
  });

  it("refuses an enum named like a table in PostgreSQL", async () => {
    await dispatchMcpAction("create_table", { name: "users" });
    const result = await dispatchMcpAction("create_table", {
      name: "accounts",
      columns: [{ name: "kind", enumName: "users", enumValues: ["a"] }],
    });
    expect(result).toMatchObject({ ok: false });
    expect(schema().tables.map((t) => t.name)).toEqual(["users"]);
  });
});

describe("second agent review cases", () => {
  beforeEach(() => resetStore());
  const names = () => useSchemaStore.getState().schema.tables.map((t) => t.name);

  it("keeps the history in order when a call arrives during auto_layout", async () => {
    await dispatchMcpAction("create_table", { name: "a" });
    useSchemaStore.temporal.getState().clear();
    const layout = dispatchMcpAction("auto_layout", {});
    await dispatchMcpAction("create_table", { name: "b" });
    await layout;
    const { undo } = useSchemaStore.temporal.getState();
    undo();
    expect(names()).toEqual(["a", "b"]);
    undo();
    expect(names()).toEqual(["a"]);
    undo();
    expect(names()).toEqual(["a"]);
  });

  it("turns AUTO_INCREMENT off on a column created as an enum", async () => {
    resetStore("mysql");
    await dispatchMcpAction("create_table", {
      name: "t",
      columns: [{ name: "s", type: "int", enumValues: ["x"], isAutoIncrement: true }],
    });
    expect(useSchemaStore.getState().schema.tables[0].columns[0]).toMatchObject({
      type: "enum",
      isAutoIncrement: false,
    });
  });

  it("lets a MySQL enum have a table's name, since MySQL ignores it", async () => {
    resetStore("mysql");
    await dispatchMcpAction("create_table", { name: "users" });
    const result = await dispatchMcpAction("add_column", {
      table: "users",
      column: { name: "kind", enumValues: ["a"], enumName: "users" },
    });
    expect(result).toMatchObject({ ok: true });
  });
});
