import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { useChatStore } from "../stores/chatStore";
import { detectProvider } from "./providerDetection";
import { setApiKey as setApiKeyOnAgent } from "./chatCommands";
import type { Conversation, Provider, ProviderId } from "../types/chat";
import { makeProvider, PROVIDER_IDS } from "../types/chat";

interface ConversationsFile {
  conversations: Conversation[];
}

interface ConfigFile {
  providers?: Record<string, Provider>;
  apiKeys?: Record<string, string>;
  provider?: Provider | null;
  apiKey?: string;
}

let socadbDir: string | null = null;

async function getSocadbDir(): Promise<string> {
  if (!socadbDir) {
    const home = await homeDir();
    socadbDir = `${home}.socadb/`;
  }
  return socadbDir;
}

async function conversationsPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}conversations.json`;
}

async function configPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}config.json`;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function writeConversationsToDisk() {
  try {
    const { conversations } = useChatStore.getState();
    const data: ConversationsFile = { conversations };
    await invoke("atomic_write", {
      path: await conversationsPath(),
      content: JSON.stringify(data),
    });
  } catch {
    // Write failed — silently ignore
  }
}

function saveConversations() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void writeConversationsToDisk(), 150);
}

async function loadConversations() {
  const path = await conversationsPath();
  let content: string | null = null;
  try {
    content = await readTextFile(path);
  } catch {
    // File doesn't exist — first launch
  }

  if (content !== null) {
    try {
      const data = JSON.parse(content) as ConversationsFile;
      if (data.conversations?.length > 0) {
        useChatStore.getState().setConversations(data.conversations);
      }
    } catch {
      // Corrupt JSON: back up the original before any rewrite overwrites it.
      const backup = `${path}.corrupt-${Date.now()}`;
      try {
        await invoke("atomic_write", { path: backup, content });
      } catch {
        // Backup failed — nothing else we can safely do here
      }
    }
  }

  if (useChatStore.getState().conversations.length === 0) {
    useChatStore.getState().newConversation();
  }
}

async function loadConfigFile(): Promise<ConfigFile | null> {
  try {
    const content = await readTextFile(await configPath());
    return JSON.parse(content) as ConfigFile;
  } catch {
    return null;
  }
}

function migrateConfig(config: ConfigFile): ConfigFile {
  if (config.provider && !config.providers) {
    const oldProvider = config.provider;
    const id =
      oldProvider.id === ("claude-code" as string) ? "claude" : String(oldProvider.id);
    const migrated: Provider = {
      ...oldProvider,
      id: id as ProviderId,
    };
    const result: ConfigFile = {
      providers: { [id]: migrated },
    };
    if (config.apiKey) {
      result.apiKeys = { [id]: config.apiKey };
    }
    return result;
  }
  return config;
}

async function saveConfig(config: ConfigFile) {
  try {
    const clean: ConfigFile = {
      providers: config.providers,
      ...(config.apiKeys ? { apiKeys: config.apiKeys } : {}),
    };
    await invoke("atomic_write", {
      path: await configPath(),
      content: JSON.stringify(clean),
    });
  } catch {
    // Write failed — silently ignore
  }
}

async function migrateApiKeysToKeyring(config: ConfigFile) {
  if (!config.apiKeys) return;
  const remaining: Record<string, string> = {};
  for (const [id, key] of Object.entries(config.apiKeys)) {
    try {
      await invoke("keyring_set", { account: id, password: key });
    } catch {
      remaining[id] = key;
    }
  }
  config.apiKeys = Object.keys(remaining).length > 0 ? remaining : undefined;
  await saveConfig(config);
}

export async function saveProviderConfig(id: ProviderId, provider: Provider) {
  try {
    const existing = await loadConfigFile();
    const config = existing ? migrateConfig(existing) : {};
    const providers = { ...(config.providers ?? {}), [id]: provider };
    await saveConfig({ ...config, providers });
  } catch {
    // Write failed — silently ignore
  }
}

export function persistProvider(id: ProviderId, provider: Provider) {
  useChatStore.getState().setProvider(id, provider);
  void saveProviderConfig(id, provider);
}

export async function saveApiKey(id: ProviderId, apiKey: string): Promise<boolean> {
  try {
    await invoke("keyring_set", { account: id, password: apiKey });
    return true;
  } catch {
    try {
      const existing = await loadConfigFile();
      const config = existing ? migrateConfig(existing) : {};
      config.apiKeys = { ...(config.apiKeys ?? {}), [id]: apiKey };
      await saveConfig(config);
      return true;
    } catch {
      return false;
    }
  }
}

export async function clearApiKey(id: ProviderId): Promise<boolean> {
  let keyringOk = true;
  try {
    await invoke("keyring_delete", { account: id });
  } catch {
    keyringOk = false;
  }
  let configOk = true;
  try {
    const existing = await loadConfigFile();
    if (existing?.apiKeys?.[id]) {
      const config = migrateConfig(existing);
      const apiKeys = Object.fromEntries(
        Object.entries(config.apiKeys ?? {}).filter(([k]) => k !== id),
      );
      config.apiKeys = Object.keys(apiKeys).length > 0 ? apiKeys : undefined;
      await saveConfig(config);
    }
  } catch {
    configOk = false;
  }
  return keyringOk || configOk;
}

async function loadApiKeyFromKeyring(id: string): Promise<string | null> {
  try {
    return await invoke<string | null>("keyring_get", { account: id });
  } catch {
    return null;
  }
}

let chatPersistenceInitialized = false;

export function initChatPersistence() {
  if (chatPersistenceInitialized) return;
  chatPersistenceInitialized = true;
  void loadConversations();
  void loadConfigFile().then(async (raw) => {
    const config = raw ? migrateConfig(raw) : {};

    if (config.apiKeys && Object.keys(config.apiKeys).length > 0) {
      await migrateApiKeysToKeyring(config);
    }

    for (const id of PROVIDER_IDS) {
      const key = (await loadApiKeyFromKeyring(id)) ?? config.apiKeys?.[id] ?? null;
      if (key) {
        setApiKeyOnAgent(id, key);
      }
    }

    if (config.providers) {
      for (const [id, provider] of Object.entries(config.providers)) {
        if (provider.connected) {
          useChatStore.getState().setProvider(id as ProviderId, provider);
        }
      }
    }

    for (const id of PROVIDER_IDS) {
      const existing = config.providers?.[id];
      if (!existing?.connected) {
        try {
          const result = await detectProvider(id);
          if (result.authenticated) {
            persistProvider(
              id,
              makeProvider(
                id,
                true,
                result.loginType === "api-key" ? "api-key" : "subscription",
                result.email,
              ),
            );
          }
        } catch {
          // Detection failed — skip
        }
      }
    }
  });

  useChatStore.subscribe(saveConversations);
}
