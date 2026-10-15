import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "get_schema",
    {
      description:
        "Get the complete database schema: tables with notes, columns (type parameters, default and its kind, enum values, note) and indexes, relations, and PostgreSQL enum types",
      inputSchema: {},
    },
    async () => ok(await send("get_schema")),
  );

  server.registerTool(
    "get_table",
    {
      description: "Get a specific table by name with its note, columns and indexes",
      inputSchema: {
        name: z.string().describe("The table name to look up"),
      },
    },
    async ({ name }) => {
      const table = await send("get_table", { name });
      return table ? ok(table) : err(`Table "${name}" not found`);
    },
  );

  server.registerTool(
    "get_editor_state",
    {
      description:
        "Get the current editor state: file path, schema name, number of tables and relations",
      inputSchema: {},
    },
    async () => ok(await send("get_editor_state")),
  );
}
