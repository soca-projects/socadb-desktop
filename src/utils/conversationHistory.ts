import type { Conversation } from "../types/chat";

export type HistoryGroup = "today" | "yesterday" | "week" | "month" | "older";

const ORDER: HistoryGroup[] = ["today", "yesterday", "week", "month", "older"];
const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function historyGroup(updatedAt: string, now: Date): HistoryGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(updatedAt))) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  if (days < 30) return "month";
  return "older";
}

export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function matchesQuery(conversation: Conversation, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return (
    fold(conversation.name).includes(q) ||
    conversation.messages.some((m) => fold(m.content).includes(q))
  );
}

export function groupConversations(
  conversations: Conversation[],
  query: string,
  now: Date,
): { group: HistoryGroup; items: Conversation[] }[] {
  const sorted = conversations
    .filter((c) => c.messages.length > 0 && matchesQuery(c, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return ORDER.map((group) => ({
    group,
    items: sorted.filter((c) => historyGroup(c.updatedAt, now) === group),
  })).filter((g) => g.items.length > 0);
}
