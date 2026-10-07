import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getSocadbDir } from "./socadbDir";
import { ConversationFileZ, ConversationZ, LegacyConversationsZ } from "./zodSchemas";
import type { Conversation, ProviderId } from "../types/chat";

// Claude session ids are UUID v4, Codex thread ids UUID v7.
export function providerFromSessionId(sessionId: string | null): ProviderId | undefined {
  const match = sessionId?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-([47])[0-9a-f]{3}-/i);
  if (!match) return undefined;
  return match[1] === "4" ? "claude" : "codex";
}

export function serializeConversation(conversation: Conversation): string {
  return JSON.stringify({ version: 1, ...conversation });
}

export function parseConversationFile(raw: string): Conversation | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!ConversationFileZ.safeParse(json).success) return null;
  return ConversationZ.parse(json);
}

export async function listConversations(): Promise<Conversation[]> {
  const files = await invoke<string[]>("conversation_list");
  const conversations: Conversation[] = [];
  for (const raw of files) {
    const conversation = parseConversationFile(raw);
    if (conversation) conversations.push(conversation);
    else console.warn("[conversationFiles] skipped an unreadable conversation file");
  }
  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function writeConversation(conversation: Conversation): Promise<void> {
  return invoke("conversation_write", {
    id: conversation.id,
    content: serializeConversation(conversation),
  });
}

export function deleteConversationFiles(conversation: Conversation): Promise<void> {
  return invoke("conversation_delete", {
    id: conversation.id,
    provider:
      conversation.provider ?? providerFromSessionId(conversation.sessionId) ?? null,
    sessionId: conversation.sessionId,
  });
}

export async function pruneClaudeSessions(conversations: Conversation[]): Promise<void> {
  const keep = conversations
    .filter((c) => (c.provider ?? providerFromSessionId(c.sessionId)) === "claude")
    .flatMap((c) => (c.sessionId ? [c.sessionId] : []));
  await invoke("claude_sessions_prune", { keep });
}

// The legacy file is renamed rather than deleted, and left untouched when it
// can't be read, so a failed migration never loses conversations.
export async function migrateLegacyConversations(): Promise<void> {
  let raw: string;
  try {
    raw = await readTextFile(await join(await getSocadbDir(), "conversations.json"));
  } catch {
    return;
  }
  let entries: unknown[];
  try {
    const parsed = LegacyConversationsZ.safeParse(JSON.parse(raw));
    if (!parsed.success) return;
    entries = parsed.data.conversations;
  } catch {
    return;
  }
  for (const entry of entries) {
    const parsed = ConversationZ.safeParse(entry);
    if (!parsed.success || parsed.data.messages.length === 0) continue;
    const conversation = parsed.data;
    await writeConversation({
      ...conversation,
      provider: conversation.provider ?? providerFromSessionId(conversation.sessionId),
    });
  }
  await invoke("conversation_retire_legacy");
}
