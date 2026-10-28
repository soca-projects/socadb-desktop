import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { dataDir, homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { z } from "zod";
import i18next from "../i18n";
import {
  CodexMcpEntryZ,
  IntegrationChoicesZ,
  IntegrationWritesZ,
  McpClientConfigZ,
  McpLaunchesZ,
  McpServerEntryZ,
  type IntegrationChoiceZ,
} from "./zodSchemas";
import {
  INTEGRATIONS_UNKNOWN,
  parseConfig,
  queueConfigWrite,
  readConfigForUpdate,
  socadbConfigPath,
} from "./socadbDir";
import { logError, logInfo, logWarn } from "./log";

export const INTEGRATION_IDS = ["claudeCode", "claudeDesktop", "codex"] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];
export type IntegrationChoice = z.infer<typeof IntegrationChoiceZ>;
type IntegrationChoices = Partial<Record<IntegrationId, IntegrationChoice>>;
type IntegrationTimes = Partial<Record<IntegrationId, string>>;

export const CLIENT_NAMES: Record<IntegrationId, string> = {
  claudeCode: "Claude Code",
  claudeDesktop: "Claude Desktop",
  codex: "Codex",
};

export interface ClientEntry {
  installed: boolean;
  command: string | null;
  args: string[] | null;
}

export interface IntegrationStatus {
  id: IntegrationId;
  installed: boolean;
  enabled: boolean;
  pending: boolean;
  removed: boolean;
  unreadable: boolean;
}

interface McpServerConfig {
  command: string;
  args: string[];
  type?: string;
}

// The server records which entry launched it from this argument, whatever name
// the AI app gives itself.
export function serverArgs(id: IntegrationId): string[] {
  return ["--client", id];
}

function sameArgs(a: readonly string[] | null | undefined, b: readonly string[]) {
  return (
    a !== null &&
    a !== undefined &&
    a.length === b.length &&
    a.every((x, i) => x === b[i])
  );
}

export function hasLoaded(launchedAt: string | undefined, writtenAt: string | undefined) {
  if (launchedAt === undefined) return false;
  return writtenAt === undefined || Date.parse(launchedAt) > Date.parse(writtenAt);
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
  if (current.command === server.command && sameArgs(current.args, server.args))
    return null;
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

// A choice of "on" is only saved once the entry was written, so a missing entry
// was removed by the user, unless mayReAdd says the client may have overwritten
// it without ever loading it.
export function planLaunch(
  choice: IntegrationChoice | undefined,
  entry: ClientEntry,
  ours: McpServerConfig,
  mayReAdd: boolean,
): { register: boolean; choice: IntegrationChoice | undefined } {
  if (!entry.installed || choice === "off" || choice === "removed") {
    return { register: false, choice };
  }
  if (entry.command === null) {
    return choice === "on" && !mayReAdd
      ? { register: false, choice: "removed" }
      : { register: true, choice: "on" };
  }
  if (!isOurCommand(entry.command)) return { register: false, choice };
  return {
    register: entry.command !== ours.command || !sameArgs(entry.args, ours.args),
    choice: "on",
  };
}

// Turned off while Claude Desktop was running, the entry comes back with its
// next rewrite of the config it read at launch. In the other clients, an entry
// back while off was added by the user.
export function shouldUnregister(
  choice: IntegrationChoice | undefined,
  entry: ClientEntry,
  rewritesItsConfig: boolean,
) {
  return (
    rewritesItsConfig &&
    entry.installed &&
    choice === "off" &&
    entry.command !== null &&
    isOurCommand(entry.command)
  );
}

export function statusOf(
  id: IntegrationId,
  choice: IntegrationChoice | undefined,
  entry: ClientEntry,
  loaded: boolean,
): IntegrationStatus {
  const enabled =
    entry.installed &&
    choice !== "off" &&
    choice !== "removed" &&
    entry.command !== null &&
    isOurCommand(entry.command);
  return {
    id,
    installed: entry.installed,
    enabled,
    pending: enabled && !loaded,
    removed: entry.installed && choice === "removed",
    unreadable: false,
  };
}

interface Client {
  // Claude Desktop rewrites its config from the copy it read at launch, which
  // drops an entry SocaDB added since: only there can a missing entry be ours to
  // write back.
  rewritesItsConfig: boolean;
  serverFor(command: string): McpServerConfig;
  read(): Promise<ClientEntry>;
  write(server: McpServerConfig | null): Promise<void>;
}

function jsonClient(
  configPath: () => Promise<string>,
  serverFor: (command: string) => McpServerConfig,
  rewritesItsConfig = false,
): Client {
  return {
    rewritesItsConfig,
    serverFor,
    async read() {
      const path = await configPath();
      // Only clients already set up here: never create a config file for them.
      if (!(await exists(path))) return { installed: false, command: null, args: null };
      const config = McpClientConfigZ.parse(JSON.parse(await readTextFile(path)));
      const entry = McpServerEntryZ.safeParse(config.mcpServers?.[SERVER_NAME]);
      return {
        installed: true,
        command: entry.success ? (entry.data.command ?? null) : null,
        args: entry.success ? (entry.data.args ?? null) : null,
      };
    },
    async write(server) {
      const path = await configPath();
      const config: unknown = JSON.parse(await readTextFile(path));
      const updated =
        server === null ? withoutSocadbServer(config) : withSocadbServer(config, server);
      if (!updated) return;
      await invoke("atomic_write", { path, content: JSON.stringify(updated, null, 2) });
    },
  };
}

const CLIENTS: Record<IntegrationId, Client> = {
  claudeCode: jsonClient(
    async () => join(await homeDir(), ".claude.json"),
    (command) => ({ command, args: serverArgs("claudeCode"), type: "stdio" }),
  ),
  claudeDesktop: jsonClient(
    async () => join(await dataDir(), "Claude", "claude_desktop_config.json"),
    (command) => ({ command, args: serverArgs("claudeDesktop") }),
    true,
  ),
  codex: {
    rewritesItsConfig: false,
    serverFor: (command) => ({ command, args: serverArgs("codex") }),
    async read() {
      return CodexMcpEntryZ.parse(await invoke("codex_mcp_entry"));
    },
    async write(server) {
      await invoke("codex_mcp_set", {
        command: server?.command ?? null,
        args: server?.args ?? null,
      });
    },
  },
};

interface StoredChoices {
  choices: IntegrationChoices;
  writtenAt: IntegrationTimes;
  unknown: boolean;
}

// null when config.json exists but can't be read: its choices are unknown, and
// assuming none would re-register SocaDB where the user removed it.
async function readChoices(): Promise<StoredChoices | null> {
  const path = await socadbConfigPath();
  if (!(await exists(path))) return { choices: {}, writtenAt: {}, unknown: false };
  let config: Record<string, unknown> | null;
  try {
    config = parseConfig(await readTextFile(path));
  } catch {
    return null;
  }
  if (!config) return null;
  const choices = IntegrationChoicesZ.safeParse(config.integrations);
  const writtenAt = IntegrationWritesZ.safeParse(config.integrationWrites);
  return {
    choices: choices.success ? choices.data : {},
    writtenAt: writtenAt.success ? writtenAt.data : {},
    unknown: config[INTEGRATIONS_UNKNOWN] === true,
  };
}

async function readLaunches(): Promise<IntegrationTimes> {
  try {
    const path = await join(await homeDir(), ".socadb", "mcp-clients.json");
    if (!(await exists(path))) return {};
    const launches = McpLaunchesZ.safeParse(JSON.parse(await readTextFile(path)));
    if (launches.success) return launches.data;
    logWarn(
      "mcp.registration.launches_unreadable",
      "mcp-clients.json doesn't match its format",
    );
    return {};
  } catch (e) {
    logWarn("mcp.registration.launches_unreadable", e);
    return {};
  }
}

// While the choices are unknown, "on" keeps an existing entry up to date and
// turns a missing one into "removed": SocaDB is never added back on its own.
export function launchChoice(
  choice: IntegrationChoice | undefined,
  unknown: boolean,
): IntegrationChoice | undefined {
  return choice ?? (unknown ? "on" : undefined);
}

async function clearUnknownChoices() {
  await queueConfigWrite(async () => {
    const path = await socadbConfigPath();
    const data = Object.fromEntries(
      Object.entries(await readConfigForUpdate(path)).filter(
        ([key]) => key !== INTEGRATIONS_UNKNOWN,
      ),
    );
    await invoke("atomic_write", { path, content: JSON.stringify(data) });
  });
}

async function saveChoice(
  id: IntegrationId,
  choice: IntegrationChoice,
  writtenAt?: string,
) {
  await queueConfigWrite(async () => {
    const path = await socadbConfigPath();
    const data = await readConfigForUpdate(path);
    const choices = IntegrationChoicesZ.safeParse(data.integrations);
    data.integrations = { ...(choices.success ? choices.data : {}), [id]: choice };
    if (writtenAt) {
      const writes = IntegrationWritesZ.safeParse(data.integrationWrites);
      data.integrationWrites = {
        ...(writes.success ? writes.data : {}),
        [id]: writtenAt,
      };
    }
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

// Parse errors of other apps' configs can quote the file (JSC's JSON errors
// include the bad token), and those files hold tokens: log only the kind.
export function configErrorForLog(error: unknown): unknown {
  return error instanceof SyntaxError ? "Invalid JSON" : error;
}

export function getMcpServerPath(): Promise<string> {
  return invoke<string>("get_mcp_binary_path");
}

export async function syncIntegrations(): Promise<IntegrationId[]> {
  // A dev build would repoint the AI clients at the checkout's binary on every
  // launch. Toggling in Settings still writes, since it's an explicit choice.
  if (import.meta.env.DEV) return [];
  return serialize(async () => {
    let ours: string;
    try {
      ours = await getMcpServerPath();
    } catch (e) {
      logError("mcp.registration.binary_missing", e);
      return [];
    }
    const stored = await readChoices();
    if (stored === null) {
      logWarn(
        "mcp.registration.skipped",
        "config.json can't be read; integrations left as they are",
      );
      return [];
    }
    const { choices, writtenAt, unknown } = stored;
    const launches = await readLaunches();
    const added: IntegrationId[] = [];
    let settled = true;
    for (const id of INTEGRATION_IDS) {
      try {
        const client = CLIENTS[id];
        const choice = launchChoice(choices[id], unknown);
        const mayReAdd =
          client.rewritesItsConfig && !unknown && !hasLoaded(launches[id], writtenAt[id]);
        const server = client.serverFor(ours);
        const entry = await client.read();
        if (shouldUnregister(choice, entry, client.rewritesItsConfig)) {
          await client.write(null);
          logInfo("mcp.registration.reapplied_off", id);
          continue;
        }
        const plan = planLaunch(choice, entry, server, mayReAdd);
        const now = new Date().toISOString();
        if (plan.register) {
          await client.write(server);
          if (entry.command === null) added.push(id);
        }
        if (plan.choice && (plan.register || plan.choice !== choices[id])) {
          await saveChoice(id, plan.choice, plan.register ? now : undefined);
        }
      } catch (e) {
        settled = false;
        // Never rewrite a file we couldn't parse: it holds the client's whole config.
        logWarn("mcp.registration.failed", configErrorForLog(e), { client: id });
      }
    }
    if (unknown && settled) await clearUnknownChoices();
    return added;
  });
}

export function notifyRegistered(ids: readonly IntegrationId[]) {
  if (ids.length === 0) return;
  logInfo("mcp.registration.added", ids.join(", "));
  const names = new Intl.ListFormat(i18next.language, { type: "conjunction" }).format(
    ids.map((id) => CLIENT_NAMES[id]),
  );
  toast.info(i18next.t("integrations.registered", { names, count: ids.length }));
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const stored = await readChoices();
  const launches = await readLaunches();
  return Promise.all(
    INTEGRATION_IDS.map(async (id) => {
      try {
        const loaded = hasLoaded(launches[id], stored?.writtenAt[id]);
        return statusOf(id, stored?.choices[id], await CLIENTS[id].read(), loaded);
      } catch (e) {
        logWarn("mcp.registration.config_unreadable", configErrorForLog(e), {
          client: id,
        });
        return {
          id,
          installed: true,
          enabled: false,
          pending: false,
          removed: false,
          unreadable: true,
        };
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
      const now = new Date().toISOString();
      await CLIENTS[id].write(CLIENTS[id].serverFor(await getMcpServerPath()));
      await saveChoice(id, "on", now);
      return;
    }
    const entry = await CLIENTS[id].read();
    if (entry.command !== null && isOurCommand(entry.command))
      await CLIENTS[id].write(null);
    await saveChoice(id, "off");
  });
}
