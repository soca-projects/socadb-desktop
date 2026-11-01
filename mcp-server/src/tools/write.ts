import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { err, ok } from "./result.js";

const columnFields = {
  type: z
    .string()
    .describe(
      "Column type as SQL writes it; it must exist in the schema's dbType. MySQL: int, bigint, tinyint, smallint, mediumint, float, double, decimal, varchar, char, text, mediumtext, longtext, boolean, date, time, datetime, timestamp, json, enum, blob. PostgreSQL: integer, bigint, smallint, real, double precision, numeric, varchar, char, text, boolean, date, time, timestamp, timestamptz, uuid, serial, bigserial, json, jsonb, bytea, enum. Parameters can be written inline: varchar(120), decimal(10,2), int unsigned, enum('a','b')",
    ),
  isPrimaryKey: z.boolean().optional().describe("Is this a primary key"),
  isNullable: z.boolean().optional().describe("Is this column nullable"),
  isUnique: z.boolean().optional().describe("Is this column unique"),
  isAutoIncrement: z.boolean().optional().describe("MySQL AUTO_INCREMENT (PostgreSQL uses serial types)"),
  unsigned: z.boolean().optional().describe("MySQL UNSIGNED, for numeric types"),
  length: z.number().int().positive().optional().describe("Length of varchar or char (255 when unset)"),
  precision: z.number().int().positive().optional().describe("Precision of decimal or numeric"),
  scale: z.number().int().nonnegative().optional().describe("Scale of decimal or numeric"),
  defaultValue: z.string().optional().describe("Default value"),
  defaultKind: z
    .enum(["value", "expression"])
    .optional()
    .describe("value: fixed text or number, written in quotes when needed. expression: run by the database as written, like now() or gen_random_uuid(). Guessed when unset"),
  enumValues: z.array(z.string()).optional().describe("Allowed values; makes the column an enum"),
  enumName: z
    .string()
    .optional()
    .describe("PostgreSQL only: name of the enum type. An existing enum of that name is shared with this column, and enumValues then replace its values for every column using it; otherwise the column's enum gets this name"),
};

const ColumnSchema = z.object({
  name: z.string().describe("Column name"),
  ...columnFields,
  type: columnFields.type.optional(),
  note: z.string().optional().describe("What the column holds, written as a COMMENT in the SQL export"),
});

export function registerWriteTools(server: McpServer) {
  server.registerTool(
    "create_table",
    {
      description: "Create a new table with columns",
      inputSchema: {
        name: z.string().describe("Table name"),
        columns: z.array(ColumnSchema).optional().describe("Table columns. If omitted, the table gets the user's default id column (primaryKeyForNewTables in get_schema). When you list the columns yourself, give the primary key that type, length, default and auto increment unless the user asks for another"),
        note: z.string().optional().describe("What the table holds, written as a COMMENT in the SQL export"),
      },
    },
    async ({ name, columns, note }) => {
      await send("create_table", { name, columns, note });
      return ok(`Table "${name}" created`);
    },
  );

  server.registerTool(
    "update_table",
    {
      description: "Update a table's name, color or note",
      inputSchema: {
        name: z.string().describe("Current table name"),
        newName: z.string().optional().describe("New table name"),
        color: z.string().optional().describe("Table header color as hex (e.g. #E11D48)"),
        note: z.string().nullable().optional().describe("New note; null removes it"),
      },
    },
    async ({ name, newName, color, note }) => {
      const result = await send("update_table", { name, newName, color, note });
      return result ? ok(`Table "${name}" updated`) : err(`Table "${name}" not found`);
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
          ...columnFields,
          type: columnFields.type.optional(),
          defaultValue: z.string().nullable().optional().describe("New default; null removes it"),
          note: z.string().nullable().optional().describe("New note; null removes it"),
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
    "add_index",
    {
      description:
        "Add an index on one or more columns, in order. A unique index on a single column sets that column's UNIQUE flag instead. PostgreSQL doesn't index foreign key columns by itself",
      inputSchema: {
        table: z.string().describe("Table name"),
        columns: z.array(z.string()).min(1).describe("Column names, in index order"),
        unique: z.boolean().optional().describe("UNIQUE index"),
        name: z.string().optional().describe("Index name; derived from the table and columns when unset"),
      },
    },
    async ({ table, columns, unique, name }) => {
      const result = await send("add_index", { table, columns, unique, name });
      if (!result) return err(`Table "${table}" not found`);
      return result === "column"
        ? ok(`Column "${columns[0]}" of "${table}" is now unique`)
        : ok(`Index on ${table} (${columns.join(", ")}) added`);
    },
  );

  server.registerTool(
    "delete_index",
    {
      description: "Delete an index by the name get_table shows",
      inputSchema: {
        table: z.string().describe("Table name"),
        name: z.string().describe("Index name"),
      },
    },
    async ({ table, name }) => {
      const result = await send("delete_index", { table, name });
      return result ? ok(`Index "${name}" deleted from "${table}"`) : err(`Index "${name}" not found on "${table}"`);
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
