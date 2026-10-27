import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { send } from "../bridge.js";
import { okJson } from "./result.js";

export function registerSchemaTools(server: McpServer) {
  server.registerTool(
    "list_schemas",
    {
      description:
        "List the user's schemas, as SocaDB's home screen shows them: name, folder, when it was last opened and its number of tables. An unsaved draft comes first",
      inputSchema: {},
    },
    async () => okJson(await send("list_schemas")),
  );

  server.registerTool(
    "new_schema",
    {
      description:
        "Create a new, empty schema and show it in SocaDB. Only when the user clearly asks for a new or separate database; to change the schema they were on, open it instead. Fails while the schema open in SocaDB has unsaved changes",
      inputSchema: {
        name: z.string().optional().describe("Schema name, like Blog"),
        dbType: z
          .enum(["postgresql", "mysql"])
          .optional()
          .describe("Database the schema targets; PostgreSQL when unset"),
      },
    },
    async ({ name, dbType }) => okJson(await send("new_schema", { name, dbType })),
  );

  server.registerTool(
    "open_schema",
    {
      description:
        "Open one of the user's schemas in SocaDB by name, as a click on its home screen does. Use it when the user names a schema or agrees to work on the last one they had open. Fails while the schema open in SocaDB has unsaved changes",
      inputSchema: {
        name: z.string().describe("Schema name, as list_schemas gives it"),
        folder: z
          .string()
          .optional()
          .describe("Folder holding the schema, when several share the name"),
      },
    },
    async ({ name, folder }) => okJson(await send("open_schema", { name, folder })),
  );
}
