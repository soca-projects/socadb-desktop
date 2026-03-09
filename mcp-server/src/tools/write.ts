import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

const ColumnSchema = z.object({
  name: z.string().describe("Column name"),
  type: z
    .enum([
      "uuid", "serial", "int", "bigint", "float", "decimal",
      "varchar", "text", "char", "boolean", "date", "time",
      "timestamp", "datetime", "json", "jsonb", "blob",
    ])
    .describe("Column data type"),
  isPrimaryKey: z.boolean().optional().describe("Is this a primary key"),
  isNullable: z.boolean().optional().describe("Is this column nullable"),
  isUnique: z.boolean().optional().describe("Is this column unique"),
  defaultValue: z.string().optional().describe("Default value expression"),
});

function ok(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerWriteTools(server: McpServer) {
  server.registerTool(
    "create_table",
    {
      description: "Create a new table with columns",
      inputSchema: {
        name: z.string().describe("Table name"),
        columns: z.array(ColumnSchema).optional().describe("Table columns (defaults to id uuid PK if omitted)"),
      },
    },
    async ({ name, columns }) => {
      const result = await send("create_table", { name, columns });
      return ok(`Table "${name}" created`);
    },
  );

  server.registerTool(
    "update_table",
    {
      description: "Update a table's name",
      inputSchema: {
        name: z.string().describe("Current table name"),
        newName: z.string().describe("New table name"),
      },
    },
    async ({ name, newName }) => {
      const result = await send("update_table", { name, newName });
      return result ? ok(`Table renamed from "${name}" to "${newName}"`) : err(`Table "${name}" not found`);
    },
  );

  server.registerTool(
    "delete_table",
    {
      description: "Delete a table and all its relations",
      inputSchema: {
        name: z.string().describe("Table name to delete"),
      },
    },
    async ({ name }) => {
      const result = await send("delete_table", { name });
      return result ? ok(`Table "${name}" deleted`) : err(`Table "${name}" not found`);
    },
  );

  server.registerTool(
    "add_column",
    {
      description: "Add a column to an existing table",
      inputSchema: {
        table: z.string().describe("Table name"),
        column: ColumnSchema,
      },
    },
    async ({ table, column }) => {
      const result = await send("add_column", { table, column });
      return result ? ok(`Column "${column.name}" added to "${table}"`) : err(`Table "${table}" not found`);
    },
  );

  server.registerTool(
    "update_column",
    {
      description: "Update an existing column's properties",
      inputSchema: {
        table: z.string().describe("Table name"),
        column: z.string().describe("Current column name"),
        updates: z.object({
          name: z.string().optional().describe("New column name"),
          type: z.string().optional().describe("New column type"),
          isPrimaryKey: z.boolean().optional(),
          isNullable: z.boolean().optional(),
          isUnique: z.boolean().optional(),
          defaultValue: z.string().nullable().optional(),
        }).describe("Properties to update"),
      },
    },
    async ({ table, column, updates }) => {
      const result = await send("update_column", { table, column, updates });
      return result ? ok(`Column "${column}" updated in "${table}"`) : err(`Column "${column}" not found in "${table}"`);
    },
  );

  server.registerTool(
    "delete_column",
    {
      description: "Delete a column from a table",
      inputSchema: {
        table: z.string().describe("Table name"),
        column: z.string().describe("Column name to delete"),
      },
    },
    async ({ table, column }) => {
      const result = await send("delete_column", { table, column });
      return result ? ok(`Column "${column}" deleted from "${table}"`) : err(`Column "${column}" not found in "${table}"`);
    },
  );

  server.registerTool(
    "create_relation",
    {
      description: "Create a relation between two columns",
      inputSchema: {
        fromTable: z.string().describe("Source table name"),
        fromColumn: z.string().describe("Source column name"),
        toTable: z.string().describe("Target table name"),
        toColumn: z.string().describe("Target column name"),
        type: z.enum(["1:1", "1:N", "N:1"]).optional().describe("Relation type (defaults to 1:N)"),
      },
    },
    async ({ fromTable, fromColumn, toTable, toColumn, type }) => {
      const result = await send("create_relation", { fromTable, fromColumn, toTable, toColumn, type: type ?? "1:N" });
      return result
        ? ok(`Relation ${type ?? "1:N"} created: ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`)
        : err("Failed to create relation — check table and column names");
    },
  );

  server.registerTool(
    "delete_relation",
    {
      description: "Delete a relation between two columns",
      inputSchema: {
        fromTable: z.string().describe("Source table name"),
        fromColumn: z.string().describe("Source column name"),
        toTable: z.string().describe("Target table name"),
        toColumn: z.string().describe("Target column name"),
      },
    },
    async ({ fromTable, fromColumn, toTable, toColumn }) => {
      const result = await send("delete_relation", { fromTable, fromColumn, toTable, toColumn });
      return result
        ? ok(`Relation deleted: ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`)
        : err("Relation not found");
    },
  );

  server.registerTool(
    "auto_layout",
    {
      description: "Automatically reorganize all tables on the canvas for better readability",
      inputSchema: {},
    },
    async () => {
      await send("auto_layout");
      return ok("Auto-layout applied");
    },
  );
}
