import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useChatStore } from "../stores/chatStore";
import { detectClaudeCode } from "./providerDetection";
import { setApiKey as setApiKeyOnAgent } from "./chatCommands";
import type { Conversation, Provider } from "../types/chat";
import { makeClaudeCodeProvider } from "../types/chat";

interface ConversationsFile {
  conversations: Conversation[];
}

interface ConfigFile {
  provider: Provider | null;
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

  // Ensure at least one conversation exists
  if (useChatStore.getState().conversations.length === 0) {
    useChatStore.getState().newConversation();
  }

  // Migrate old chat-history.json if it exists
  try {
    const dir = await getSocadbDir();
    const oldPath = `${dir}chat-history.json`;
    const content = await readTextFile(oldPath);
    const data = JSON.parse(content) as { messages: unknown[]; sessionId: string | null };
    if (data.messages?.length > 0 && useChatStore.getState().conversations.length === 0) {
      useChatStore.getState().setMessages(data.messages as Conversation["messages"]);
      if (data.sessionId) {
        useChatStore.getState().setSessionId(data.sessionId);
      }
    }
  } catch {
    // No old history — normal
  }
}

export async function saveProviderConfig(provider: Provider | null) {
  try {
    const existing = await loadConfigFile();
    const data: ConfigFile = { ...existing, provider };
    await writeTextFile(await configPath(), JSON.stringify(data));
  } catch {
    // Write failed — silently ignore
  }
}

export async function loadProviderConfig(): Promise<Provider | null> {
  const config = await loadConfigFile();
  return config?.provider ?? null;
}

export function persistProvider(provider: Provider) {
  useChatStore.getState().setProvider(provider);
  void saveProviderConfig(provider);
}

async function loadConfigFile(): Promise<ConfigFile | null> {
  try {
    const content = await readTextFile(await configPath());
    return JSON.parse(content) as ConfigFile;
  } catch {
    return null;
  }
}

export async function saveApiKey(apiKey: string) {
  try {
    const existing = await loadConfigFile();
    const data: ConfigFile = {
      ...existing,
      provider: existing?.provider ?? null,
      apiKey,
    };
    await writeTextFile(await configPath(), JSON.stringify(data));
  } catch {
    // Write failed — silently ignore
  }
}

export async function loadApiKey(): Promise<string | null> {
  const config = await loadConfigFile();
  return config?.apiKey ?? null;
}

export async function clearApiKey() {
  try {
    const existing = await loadConfigFile();
    if (existing) {
      const data: ConfigFile = { provider: existing.provider };
      await writeTextFile(await configPath(), JSON.stringify(data));
    }
  } catch {
    // Write failed — silently ignore
  }
}

export function initChatPersistence() {
  void loadConversations();
  void loadConfigFile().then(async (config) => {
    if (config?.apiKey) {
      setApiKeyOnAgent(config.apiKey);
    }

    const provider = config?.provider ?? null;
    if (provider?.connected) {
      useChatStore.getState().setProvider(provider);
      return;
    }
    const result = await detectClaudeCode();
    if (result.authenticated) {
      persistProvider(
        makeClaudeCodeProvider(
          true,
          result.loginType === "api-key" ? "api-key" : "subscription",
          result.email,
        ),
      );
    }
  });

  useChatStore.subscribe(saveConversations);
}
