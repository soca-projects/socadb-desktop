import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
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

async function saveConversations() {
  try {
    const { conversations } = useChatStore.getState();
    const data: ConversationsFile = { conversations };
    await writeTextFile(await conversationsPath(), JSON.stringify(data));
  } catch {
    // Write failed — silently ignore
  }
}

async function loadConversations() {
  try {
    const content = await readTextFile(await conversationsPath());
    const data = JSON.parse(content) as ConversationsFile;
    if (data.conversations?.length > 0) {
      useChatStore.getState().setConversations(data.conversations);
    }
  } catch {
    // File doesn't exist yet — first launch
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
      apiKeys: config.apiKeys,
    };
    await writeTextFile(await configPath(), JSON.stringify(clean));
  } catch {
    // Write failed — silently ignore
  }
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

export async function saveApiKey(id: ProviderId, apiKey: string) {
  try {
    const existing = await loadConfigFile();
    const config = existing ? migrateConfig(existing) : {};
    const apiKeys = { ...(config.apiKeys ?? {}), [id]: apiKey };
    await saveConfig({ ...config, apiKeys });
  } catch {
    // Write failed — silently ignore
  }
}

export async function clearApiKey(id: ProviderId) {
  try {
    const existing = await loadConfigFile();
    if (existing) {
      const config = migrateConfig(existing);
      const allKeys = config.apiKeys ?? {};
      const apiKeys = Object.fromEntries(
        Object.entries(allKeys).filter(([k]) => k !== id),
      );
      await saveConfig({ ...config, apiKeys });
    }
  } catch {
    // Write failed — silently ignore
  }
}

export function initChatPersistence() {
  void loadConversations();
  void loadConfigFile().then(async (raw) => {
    const config = raw ? migrateConfig(raw) : {};

    if (config.apiKeys) {
      for (const [id, key] of Object.entries(config.apiKeys)) {
        setApiKeyOnAgent(id as ProviderId, key);
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
