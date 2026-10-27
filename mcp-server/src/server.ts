import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { disconnect } from "./bridge.js";
import { mcpLog } from "./log.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

const server = new McpServer({
  name: "socadb",
  version: process.env.SOCADB_VERSION ?? "dev",
});

registerReadTools(server);
registerWriteTools(server);

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
