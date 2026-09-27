import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { queueConfigWrite, socadbConfigPath } from "./socadbDir";
import {
  deleteConversationFiles,
  listConversations,
  migrateLegacyConversations,
  pruneClaudeSessions,
  writeConversation,
} from "./conversationFiles";
import { useChatStore } from "../stores/chatStore";
import type { Conversation, LoginType, Provider, ProviderId } from "../types/chat";
import { makeProvider, PROVIDER_IDS } from "../types/chat";

// On-disk shape stores user preference only. `apiKeyStored` is derived at
// runtime from a keyring probe — the keyring is the single source of truth
// for "does this provider have a saved key?".
interface PersistedProvider {
  loginType: LoginType;
}

interface LegacyProvider {
  id?: string;
  connected?: boolean;
  connectionMethod?: string | null;
  email?: string | null;
  loginType?: string;
  apiKeyStored?: boolean;
}

interface ConfigFile {
  providers?: Record<string, unknown>;
  apiKeys?: Record<string, string>;
  provider?: LegacyProvider;
  apiKey?: string;
}

const saved = new Map<string, Conversation>();
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleWrite(conversation: Conversation) {
  clearTimeout(pendingWrites.get(conversation.id));
  pendingWrites.set(
    conversation.id,
    setTimeout(() => {
      pendingWrites.delete(conversation.id);
      writeConversation(conversation).catch((err) =>
        console.warn("[chatPersistence] failed to save a conversation:", err),
      );
    }, 300),
  );
}

// Empty conversations stay in memory: they get a file with their first message.
function persistChanges(conversations: Conversation[]) {
  const current = new Map(conversations.map((c) => [c.id, c]));
  for (const [id, previous] of saved) {
    if (current.has(id)) continue;
    clearTimeout(pendingWrites.get(id));
    pendingWrites.delete(id);
    saved.delete(id);
    deleteConversationFiles(previous).catch((err) =>
      console.warn("[chatPersistence] failed to delete a conversation:", err),
    );
  }
  for (const conversation of conversations) {
    if (
      conversation.messages.length === 0 ||
      saved.get(conversation.id) === conversation
    ) {
      continue;
    }
    saved.set(conversation.id, conversation);
    scheduleWrite(conversation);
  }
}

async function loadConversations() {
  try {
    await migrateLegacyConversations();
    const conversations = await listConversations();
    for (const c of conversations) saved.set(c.id, c);
    if (conversations.length > 0) useChatStore.getState().setConversations(conversations);
    pruneClaudeSessions(conversations).catch((err) =>
      console.warn("[chatPersistence] failed to prune Claude sessions:", err),
    );
  } catch (err) {
    console.warn("[chatPersistence] failed to load conversations:", err);
  }
  if (useChatStore.getState().conversations.length === 0) {
    useChatStore.getState().newConversation();
  }
  useChatStore.subscribe((state, prev) => {
    if (state.conversations !== prev.conversations) persistChanges(state.conversations);
  });
}

async function loadConfigFile(): Promise<ConfigFile | null> {
  try {
    const content = await readTextFile(await socadbConfigPath());
    return JSON.parse(content) as ConfigFile;
  } catch {
    return null;
  }
}

function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

function loginTypeFromLegacy(method: string | null | undefined): LoginType {
  return method === "api-key" ? "api-key" : "subscription";
}

interface MigratedConfig {
  providers: Partial<Record<ProviderId, PersistedProvider>>;
  apiKeys: Record<string, string>;
}

const emptyMigrated = (): MigratedConfig => ({ providers: {}, apiKeys: {} });

// Folds older formats (v0 singular `provider`, v1 with connected/connectionMethod,
// v2 with persisted apiKeyStored) into the current shape. apiKeyStored is no
// longer persisted — we derive it from the keyring on load.
function migrateConfig(config: ConfigFile): MigratedConfig {
  const providers: Partial<Record<ProviderId, PersistedProvider>> = {};
  const apiKeys: Record<string, string> = { ...(config.apiKeys ?? {}) };

  if (config.provider) {
    const legacyId = (config.provider.id ?? "claude").toString();
    const id = legacyId === "claude-code" ? "claude" : legacyId;
    if (isProviderId(id)) {
      providers[id] = {
        loginType: loginTypeFromLegacy(config.provider.connectionMethod),
      };
      if (config.apiKey) apiKeys[id] = config.apiKey;
    }
  }

  for (const [rawId, entry] of Object.entries(config.providers ?? {})) {
    if (!isProviderId(rawId)) continue;
    const candidate = entry as LegacyProvider;
    const loginType: LoginType =
      candidate.loginType === "api-key" || candidate.loginType === "subscription"
        ? candidate.loginType
        : loginTypeFromLegacy(candidate.connectionMethod);
    providers[rawId] = { loginType };
  }

  return { providers, apiKeys };
}

// MUST be called inside queueConfigWrite(). The read-modify-write window would
// otherwise race with theme/language saves that share this file.
async function writeConfigToDisk(state: {
  providers?: Record<string, PersistedProvider>;
  apiKeys?: Record<string, string>;
}) {
  const path = await socadbConfigPath();
  let existing: Record<string, unknown> = {};
  try {
    const content = await readTextFile(path);
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // No config.json yet — start from empty object.
  }

  if (state.providers) {
    existing.providers = state.providers;
  } else {
    delete existing.providers;
  }
  if (state.apiKeys && Object.keys(state.apiKeys).length > 0) {
    existing.apiKeys = state.apiKeys;
  } else {
    delete existing.apiKeys;
  }
  // Drop legacy v0 singular fields so old configs are cleaned up on next write.
  delete existing.provider;
  delete existing.apiKey;

  await invoke("atomic_write", { path, content: JSON.stringify(existing) });
}

async function migrateApiKeysToKeyring(apiKeys: Record<string, string>) {
  const remaining: Record<string, string> = {};
  for (const [id, key] of Object.entries(apiKeys)) {
    try {
      await invoke("keyring_set", { account: id, password: key });
    } catch {
      remaining[id] = key;
    }
  }
  try {
    await queueConfigWrite(async () => {
      const current = await loadConfigFile();
      const migrated = current ? migrateConfig(current) : emptyMigrated();
      migrated.apiKeys = remaining;
      await writeConfigToDisk(migrated);
    });
  } catch (err) {
    console.warn("[chatPersistence] failed to finish apiKey migration:", err);
  }
}

function toPersisted(provider: Provider): PersistedProvider {
  return { loginType: provider.loginType };
}

export async function saveProviderConfig(id: ProviderId, provider: Provider) {
  try {
    await queueConfigWrite(async () => {
      const existing = await loadConfigFile();
      const migrated = existing ? migrateConfig(existing) : emptyMigrated();
      migrated.providers[id] = toPersisted(provider);
      await writeConfigToDisk(migrated);
    });
  } catch (err) {
    console.warn("[chatPersistence] failed to persist provider config:", err);
  }
}

export function persistProvider(id: ProviderId, provider: Provider) {
  useChatStore.getState().setProvider(id, provider);
  void saveProviderConfig(id, provider);
}

// Best-effort scrub of a legacy plaintext copy of `id`'s key from config.json.
async function clearPlaintextApiKey(id: ProviderId): Promise<void> {
  try {
    await queueConfigWrite(async () => {
      const existing = await loadConfigFile();
      if (!existing?.apiKeys?.[id]) return;
      const migrated = migrateConfig(existing);
      if (!migrated.apiKeys[id]) return;
      migrated.apiKeys = Object.fromEntries(
        Object.entries(migrated.apiKeys).filter(([k]) => k !== id),
      );
      await writeConfigToDisk(migrated);
    });
  } catch (err) {
    console.warn("[chatPersistence] failed to clear plaintext apiKey:", err);
  }
}

export async function saveApiKey(id: ProviderId, apiKey: string): Promise<boolean> {
  try {
    await invoke("keyring_set", { account: id, password: apiKey });
  } catch {
    return false;
  }
  void clearPlaintextApiKey(id);
  return true;
}

export async function clearApiKey(id: ProviderId): Promise<boolean> {
  await clearPlaintextApiKey(id);
  try {
    await invoke("keyring_delete", { account: id });
    return true;
  } catch {
    return false;
  }
}

export async function isApiKeyStored(id: ProviderId): Promise<boolean> {
  try {
    const key = await invoke<string | null>("keyring_get", { account: id });
    return key !== null && key.length > 0;
  } catch {
    return false;
  }
}

let chatPersistenceInitialized = false;

export function initChatPersistence() {
  if (chatPersistenceInitialized) return;
  chatPersistenceInitialized = true;
  void loadConversations();
  void loadConfigFile().then(async (raw) => {
    const migrated = raw ? migrateConfig(raw) : emptyMigrated();

    // One-time migration: lift any legacy plaintext keys into the keyring.
    if (Object.keys(migrated.apiKeys).length > 0) {
      await migrateApiKeysToKeyring(migrated.apiKeys);
    }

    for (const id of PROVIDER_IDS) {
      const persisted = migrated.providers[id];
      const loginType: LoginType = persisted?.loginType ?? "subscription";
      const apiKeyStored = await isApiKeyStored(id);
      useChatStore.getState().setProvider(id, makeProvider(id, loginType, apiKeyStored));
    }
  });
}
