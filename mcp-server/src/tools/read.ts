import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { err, okJson } from "./result.js";

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "get_schema",
    {
      description:
        "Get the complete database schema: tables with notes, columns (type parameters, default and its kind, enum values, note) and indexes, relations, and PostgreSQL enum types",
      inputSchema: {},
    },
    async () => okJson(await send("get_schema")),
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
      return table ? okJson(table) : err(`Table "${name}" not found`);
    },
  );

  server.registerTool(
    "get_editor_state",
    {
      description:
        "Get the current editor state: file path, schema name, number of tables and relations",
      inputSchema: {},
    },
    async () => okJson(await send("get_editor_state")),
  );
}
