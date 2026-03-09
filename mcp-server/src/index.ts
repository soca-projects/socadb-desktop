#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connect } from "./bridge.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

const server = new McpServer({
  name: "socadb",
  version: "0.1.0",
});

registerReadTools(server);
registerWriteTools(server);

async function main() {
  await connect();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SocaDB MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
