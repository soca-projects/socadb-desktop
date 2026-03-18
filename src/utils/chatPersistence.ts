import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { homeDir } from "@tauri-apps/api/path";
import { useChatStore } from "../stores/chatStore";
import { detectClaudeCode } from "./providerDetection";
import type { ChatMessage, Provider } from "../types/chat";

interface ChatHistoryFile {
  messages: ChatMessage[];
  sessionId: string | null;
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

async function chatHistoryPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}chat-history.json`;
}

async function configPath(): Promise<string> {
  const dir = await getSocadbDir();
  return `${dir}config.json`;
}

async function saveChatHistory() {
  try {
    const { messages, sessionId } = useChatStore.getState();
    const data: ChatHistoryFile = { messages, sessionId };
    await writeTextFile(await chatHistoryPath(), JSON.stringify(data));
  } catch {
    // ~/.socadb/ might not exist yet or write failed — silently ignore
  }
}

async function loadChatHistory() {
  try {
    const content = await readTextFile(await chatHistoryPath());
    const data = JSON.parse(content) as ChatHistoryFile;
    if (data.messages) {
      useChatStore.getState().setMessages(data.messages);
    }
    if (data.sessionId) {
      useChatStore.getState().setSessionId(data.sessionId);
    }
  } catch {
    // File doesn't exist yet — first launch
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
  void loadChatHistory();
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
        connectionMethod: "subscription",
        email: result.email,
      };
      useChatStore.getState().setProvider(p);
      void saveProviderConfig(p);
    }
  });

  useChatStore.subscribe(saveChatHistory);
}
