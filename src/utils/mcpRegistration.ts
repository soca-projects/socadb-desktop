import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

interface McpServerConfig {
  command: string;
  args: string[];
  type?: string;
}

async function getMcpBinaryPath(): Promise<string> {
  return invoke<string>("get_mcp_binary_path");
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

    await registerClaudeCode(binaryPath);

    try {
      await registerClaudeDesktop(binaryPath);
    } catch {
      // Claude Desktop not installed, skip
    }
  } catch (e) {
    console.error("MCP registration failed:", e);
  }
}
