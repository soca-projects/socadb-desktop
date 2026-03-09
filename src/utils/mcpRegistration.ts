import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";
import { message } from "@tauri-apps/plugin-dialog";

interface McpServerConfig {
  command: string;
  args: string[];
  type?: string;
}

async function getMcpBinaryPath(): Promise<string> {
  // In dev, use the compiled binary from mcp-server/dist
  // In prod, it would be inside the .app bundle
  const home = await homeDir();
  const devPath = await join(
    home,
    "socadb",
    "socadb-desktop",
    "mcp-server",
    "dist",
    "socadb-mcp",
  );
  return devPath;
}

function addMcpServer(
  config: Record<string, unknown>,
  serverName: string,
  serverConfig: McpServerConfig,
): boolean {
  const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
  if (servers[serverName]) return false;
  servers[serverName] = serverConfig;
  config.mcpServers = servers;
  return true;
}

async function registerClaudeCode(binaryPath: string): Promise<boolean> {
  const home = await homeDir();
  const configPath = await join(home, ".claude.json");

  let config: Record<string, unknown> = {};
  try {
    const content = await readTextFile(configPath);
    config = JSON.parse(content);
  } catch {
    // File doesn't exist or invalid JSON, start fresh
  }

  const added = addMcpServer(config, "socadb", {
    command: binaryPath,
    args: [],
    type: "stdio",
  });

  if (added) {
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  }
  return added;
}

async function registerClaudeDesktop(binaryPath: string): Promise<boolean> {
  const home = await homeDir();
  const configPath = await join(
    home,
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json",
  );

  let config: Record<string, unknown> = {};
  try {
    const content = await readTextFile(configPath);
    config = JSON.parse(content);
  } catch {
    // File doesn't exist or invalid JSON, start fresh
  }

  const added = addMcpServer(config, "socadb", {
    command: binaryPath,
    args: [],
  });

  if (added) {
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  }
  return added;
}

export async function registerMcpServers() {
  try {
    const binaryPath = await getMcpBinaryPath();
    const registered: string[] = [];

    if (await registerClaudeCode(binaryPath)) {
      registered.push("Claude Code");
    }

    try {
      if (await registerClaudeDesktop(binaryPath)) {
        registered.push("Claude Desktop");
      }
    } catch {
      // Claude Desktop not installed, skip
    }

    if (registered.length > 0) {
      await message(
        `SocaDB MCP server registered with: ${registered.join(", ")}.\n\nYou can now use SocaDB tools in your AI CLI.`,
        { title: "MCP Setup Complete", kind: "info" },
      );
    }
  } catch (e) {
    console.error("MCP registration failed:", e);
  }
}
