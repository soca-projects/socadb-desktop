import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { dataDir, homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import type { z } from "zod";
import {
  CodexMcpEntryZ,
  IntegrationChoicesZ,
  McpClientConfigZ,
  McpServerEntryZ,
  type IntegrationChoiceZ,
} from "./zodSchemas";
import { queueConfigWrite, socadbConfigPath } from "./socadbDir";

export const INTEGRATION_IDS = ["claudeCode", "claudeDesktop", "codex"] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];
export type IntegrationChoice = z.infer<typeof IntegrationChoiceZ>;
type IntegrationChoices = Partial<Record<IntegrationId, IntegrationChoice>>;

export interface ClientEntry {
  installed: boolean;
  command: string | null;
}

export interface IntegrationStatus {
  id: IntegrationId;
  installed: boolean;
  enabled: boolean;
  removed: boolean;
  unreadable: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
  type?: string;
}

const SERVER_NAME = "socadb";

export function isOurCommand(command: string): boolean {
  return (command.split(/[\\/]/).pop() ?? "").startsWith("socadb-mcp-");
}

// Zod puts the declared keys first: rebuilding from the original object keeps
// the client's own key order, so the only change in its file is our entry.
function withServers(config: object, servers: Record<string, unknown>) {
  const updated: Record<string, unknown> = Object.fromEntries(Object.entries(config));
  updated.mcpServers = servers;
  return updated;
}

export function withSocadbServer(
  config: unknown,
  server: McpServerConfig,
): Record<string, unknown> | null {
  const parsed = McpClientConfigZ.safeParse(config);
  if (!parsed.success || typeof config !== "object" || config === null) return null;
  const servers = parsed.data.mcpServers ?? {};
  const existing = McpServerEntryZ.safeParse(servers[SERVER_NAME]);
  const current = existing.success ? existing.data : {};
  if (current.command === server.command) return null;
  return withServers(config, { ...servers, [SERVER_NAME]: { ...current, ...server } });
}

export function withoutSocadbServer(config: unknown): Record<string, unknown> | null {
  const parsed = McpClientConfigZ.safeParse(config);
  if (!parsed.success || typeof config !== "object" || config === null) return null;
  const servers = parsed.data.mcpServers;
  if (!servers?.[SERVER_NAME]) return null;
  return withServers(
    config,
    Object.fromEntries(Object.entries(servers).filter(([name]) => name !== SERVER_NAME)),
  );
}

// A choice of "on" is only saved once the entry was written, so finding the
// entry gone later means the user removed it by hand.
export function planLaunch(
  choice: IntegrationChoice | undefined,
  entry: ClientEntry,
  ours: string,
): { register: boolean; choice: IntegrationChoice | undefined } {
  if (!entry.installed || choice === "off" || choice === "removed") {
    return { register: false, choice };
  }
  if (entry.command === null) {
    return choice === "on"
      ? { register: false, choice: "removed" }
      : { register: true, choice: "on" };
  }
  if (!isOurCommand(entry.command)) return { register: false, choice };
  return { register: entry.command !== ours, choice: "on" };
}

export function statusOf(
  id: IntegrationId,
  choice: IntegrationChoice | undefined,
  entry: ClientEntry,
): IntegrationStatus {
  return {
    id,
    installed: entry.installed,
    enabled:
      entry.installed &&
      choice !== "off" &&
      choice !== "removed" &&
      entry.command !== null &&
      isOurCommand(entry.command),
    removed: entry.installed && choice === "removed",
    unreadable: false,
  };
}

interface Client {
  read(): Promise<ClientEntry>;
  write(command: string | null): Promise<void>;
}

function jsonClient(
  configPath: () => Promise<string>,
  serverFor: (command: string) => McpServerConfig,
): Client {
  return {
    async read() {
      const path = await configPath();
      // Only clients already set up here: never create a config file for them.
      if (!(await exists(path))) return { installed: false, command: null };
      const config = McpClientConfigZ.parse(JSON.parse(await readTextFile(path)));
      const entry = McpServerEntryZ.safeParse(config.mcpServers?.[SERVER_NAME]);
      return {
        installed: true,
        command: entry.success ? (entry.data.command ?? null) : null,
      };
    },
    async write(command) {
      const path = await configPath();
      const config: unknown = JSON.parse(await readTextFile(path));
      const updated =
        command === null
          ? withoutSocadbServer(config)
          : withSocadbServer(config, serverFor(command));
      if (!updated) return;
      await invoke("atomic_write", { path, content: JSON.stringify(updated, null, 2) });
    },
  };
}

const CLIENTS: Record<IntegrationId, Client> = {
  claudeCode: jsonClient(
    async () => join(await homeDir(), ".claude.json"),
    (command) => ({ command, args: [], type: "stdio" }),
  ),
  claudeDesktop: jsonClient(
    async () => join(await dataDir(), "Claude", "claude_desktop_config.json"),
    (command) => ({ command, args: [] }),
  ),
  codex: {
    async read() {
      return CodexMcpEntryZ.parse(await invoke("codex_mcp_entry"));
    },
    async write(command) {
      await invoke("codex_mcp_set", { command });
    },
  },
};

async function readChoices(): Promise<IntegrationChoices> {
  try {
    const config: unknown = JSON.parse(await readTextFile(await socadbConfigPath()));
    const choices = IntegrationChoicesZ.safeParse(
      typeof config === "object" && config !== null && "integrations" in config
        ? config.integrations
        : undefined,
    );
    return choices.success ? choices.data : {};
  } catch {
    return {};
  }
}

async function saveChoice(id: IntegrationId, choice: IntegrationChoice) {
  await queueConfigWrite(async () => {
    const path = await socadbConfigPath();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(await readTextFile(path)) as Record<string, unknown>;
    } catch {
      // First save: file doesn't exist yet, start from empty object.
    }
    const choices = IntegrationChoicesZ.safeParse(data.integrations);
    data.integrations = { ...(choices.success ? choices.data : {}), [id]: choice };
    await invoke("atomic_write", { path, content: JSON.stringify(data) });
  });
}

let chain: Promise<void> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function getMcpServerPath(): Promise<string> {
  return invoke<string>("get_mcp_binary_path");
}

export async function syncIntegrations() {
  // A dev build would repoint the AI clients at the checkout's binary on every
  // launch. Toggling in Settings still writes, since it's an explicit choice.
  if (import.meta.env.DEV) return;
  await serialize(async () => {
    const ours = await getMcpServerPath();
    const choices = await readChoices();
    for (const id of INTEGRATION_IDS) {
      try {
        const plan = planLaunch(choices[id], await CLIENTS[id].read(), ours);
        if (plan.register) await CLIENTS[id].write(ours);
        if (plan.choice && plan.choice !== choices[id]) await saveChoice(id, plan.choice);
      } catch (e) {
        // Never rewrite a file we couldn't parse: it holds the client's whole config.
        console.warn(`MCP registration skipped for ${id}:`, e);
      }
    }
  });
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const choices = await readChoices();
  return Promise.all(
    INTEGRATION_IDS.map(async (id) => {
      try {
        return statusOf(id, choices[id], await CLIENTS[id].read());
      } catch {
        return { id, installed: true, enabled: false, removed: false, unreadable: true };
      }
    }),
  );
}

export function setIntegrationEnabled(
  id: IntegrationId,
  enabled: boolean,
): Promise<void> {
  return serialize(async () => {
    if (enabled) {
      await CLIENTS[id].write(await getMcpServerPath());
      await saveChoice(id, "on");
      return;
    }
    const entry = await CLIENTS[id].read();
    if (entry.command !== null && isOurCommand(entry.command))
      await CLIENTS[id].write(null);
    await saveChoice(id, "off");
  });
}
