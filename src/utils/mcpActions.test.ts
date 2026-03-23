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

    it("defaults unknown column type to varchar", async () => {
      const result = await dispatchMcpAction("create_table", {
        name: "test",
        columns: [{ name: "col", type: "INVALID_TYPE" }],
      });
      expect(result.ok).toBe(true);
      const { schema } = useSchemaStore.getState();
      expect(schema.tables[0].columns[0].type).toBe("varchar");
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
