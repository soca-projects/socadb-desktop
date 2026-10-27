import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { disconnect, isChatClient } from "./bridge.js";
import { mcpLog } from "./log.js";
import { registerReadTools } from "./tools/read.js";
import { registerSchemaTools } from "./tools/schemas.js";
import { registerWriteTools } from "./tools/write.js";

const INSTRUCTIONS = `SocaDB is a desktop app for designing database schemas. These tools read and change what it shows.
- SocaDB has to be open. When a tool says it isn't, ask the user to open it.
- Tools act on the schema shown in SocaDB's editor. On its home screen no schema is shown: open one with open_schema, or create one with new_schema.
- Create a new schema only when the user clearly asks for a new or separate database. Otherwise work on the schema they were on, which get_editor_state names. When you can't tell which schema they mean, ask them, suggesting the last one they had open.`;

const external = !isChatClient();

const server = new McpServer(
  { name: "socadb", version: process.env.SOCADB_VERSION ?? "dev" },
  external ? { instructions: INSTRUCTIONS } : undefined,
);

registerReadTools(server);
registerWriteTools(server);
// SocaDB's own chat belongs to the schema it was opened on.
if (external) registerSchemaTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The AI app ends the session by closing stdin; the socket to SocaDB would
  // otherwise keep this process running after the app has gone.
  process.stdin.once("end", () => void disconnect().then(() => process.exit(0)));
  console.error("SocaDB MCP server running on stdio");
  mcpLog.info("mcp.server.start", "MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  mcpLog.error("mcp.server.start_failed", String(error));
  process.exit(1);
});
