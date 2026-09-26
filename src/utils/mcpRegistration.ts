import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { dataDir, homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { McpClientConfigZ, McpServerEntryZ } from "./zodSchemas";

interface McpServerConfig {
  command: string;
  args: string[];
  type?: string;
}

const SERVER_NAME = "socadb";

export function withSocadbServer(
  config: unknown,
  server: McpServerConfig,
): Record<string, unknown> | null {
  const parsed = McpClientConfigZ.safeParse(config);
  if (!parsed.success) return null;
  const servers = parsed.data.mcpServers ?? {};
  const existing = McpServerEntryZ.safeParse(servers[SERVER_NAME]);
  const current = existing.success ? existing.data : {};
  if (current.command === server.command) return null;
  return {
    ...parsed.data,
    mcpServers: { ...servers, [SERVER_NAME]: { ...current, ...server } },
  };
}

async function registerIn(configPath: string, server: McpServerConfig) {
  // Only clients already set up here: never create a config file for them.
  if (!(await exists(configPath))) return;
  const updated = withSocadbServer(JSON.parse(await readTextFile(configPath)), server);
  if (!updated) return;
  await invoke("atomic_write", {
    path: configPath,
    content: JSON.stringify(updated, null, 2),
  });
}

export async function registerMcpServers() {
  // A dev build would point the clients at the checkout's binary.
  if (import.meta.env.DEV) return;
  try {
    const command = await invoke<string>("get_mcp_binary_path");
    const targets = [
      {
        path: await join(await homeDir(), ".claude.json"),
        server: { command, args: [], type: "stdio" },
      },
      {
        path: await join(await dataDir(), "Claude", "claude_desktop_config.json"),
        server: { command, args: [] },
      },
    ];
    for (const { path, server } of targets) {
      try {
        await registerIn(path, server);
      } catch (e) {
        // Never rewrite a file we couldn't parse: it holds the client's whole config.
        console.warn(`MCP registration skipped for ${path}:`, e);
      }
    }
  } catch (e) {
    console.error("MCP registration failed:", e);
  }
}
