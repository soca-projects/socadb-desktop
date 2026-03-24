import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useChatStore } from "../stores/chatStore";
import { detectClaudeCode } from "./providerDetection";
import type { Conversation, Provider } from "../types/chat";

interface ConversationsFile {
  conversations: Conversation[];
}

interface ConfigFile {
  provider: Provider | null;
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
    const data: ConfigFile = { provider };
    await writeTextFile(await configPath(), JSON.stringify(data));
  } catch {
    // Write failed — silently ignore
  }
}

export async function loadProviderConfig(): Promise<Provider | null> {
  try {
    const content = await readTextFile(await configPath());
    const data = JSON.parse(content) as ConfigFile;
    return data.provider ?? null;
  } catch {
    return null;
  }
}

export function initChatPersistence() {
  void loadConversations();
  void loadProviderConfig().then(async (provider) => {
    if (provider?.connected) {
      useChatStore.getState().setProvider(provider);
      return;
    }
    const result = await detectClaudeCode();
    if (result.authenticated) {
      const p: Provider = {
        id: "claude-code",
        name: "Anthropic Claude Code",
        connected: true,
        connectionMethod: result.loginType === "api-key" ? "api-key" : "subscription",
        email: result.email,
      };
      useChatStore.getState().setProvider(p);
      void saveProviderConfig(p);
    }
  });

  useChatStore.subscribe(saveConversations);
}
