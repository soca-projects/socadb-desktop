import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { err, okJson } from "./result.js";

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "get_schema",
    {
      description:
        "Get the complete database schema: tables with notes, columns (type parameters, default and its kind, enum values, note) and indexes, relations, PostgreSQL enum types, and primaryKeyForNewTables: the id column the user wants new tables to start with",
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
        "Get what SocaDB shows: its home screen, or a schema in the editor with its file path, name, database, and number of tables and relations. On the home screen, it names the last schema the user had open",
      inputSchema: {},
    },
    async () => okJson(await send("get_editor_state")),
  );
}
