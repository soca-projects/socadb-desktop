import { describe, it, expect } from "vitest";
import { groupConversations, historyGroup, matchesQuery } from "./conversationHistory";
import type { Conversation } from "../types/chat";

const NOW = new Date("2026-09-27T15:00:00");

function conv(id: string, updatedAt: string, content = "hello", name = id): Conversation {
  const iso = new Date(updatedAt).toISOString();
  return {
    id,
    name,
    sessionId: null,
    createdAt: iso,
    updatedAt: iso,
    messages: [{ id: `${id}-m`, role: "user", content, toolCalls: [], timestamp: iso }],
  };
}

describe("historyGroup", () => {
  it.each([
    ["2026-09-27T08:00:00", "today"],
    ["2026-09-26T23:00:00", "yesterday"],
    ["2026-09-22T12:00:00", "week"],
    ["2026-09-05T12:00:00", "month"],
    ["2026-07-01T12:00:00", "older"],
  ])("puts %s in %s", (date, group) => {
    expect(historyGroup(new Date(date).toISOString(), NOW)).toBe(group);
  });
});

describe("matchesQuery", () => {
  const c = conv("c", "2026-09-27T08:00:00", "Passage à PostgreSQL", "Schéma blog");

  it("matches titles and message text, ignoring case and accents", () => {
    expect(matchesQuery(c, "schema")).toBe(true);
    expect(matchesQuery(c, "POSTGRES")).toBe(true);
    expect(matchesQuery(c, "passage a")).toBe(true);
    expect(matchesQuery(c, "mysql")).toBe(false);
  });

  it("matches everything for a blank query", () => {
    expect(matchesQuery(c, "  ")).toBe(true);
  });
});

describe("groupConversations", () => {
  it("sorts newest first, drops empty conversations, and keeps group order", () => {
    const empty = { ...conv("e", "2026-09-27T09:00:00"), messages: [] };
    const groups = groupConversations(
      [
        conv("old", "2026-07-01T12:00:00"),
        empty,
        conv("a", "2026-09-27T08:00:00"),
        conv("b", "2026-09-27T12:00:00"),
      ],
      "",
      NOW,
    );
    expect(groups.map((g) => g.group)).toEqual(["today", "older"]);
    expect(groups[0].items.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("filters with the query", () => {
    const groups = groupConversations(
      [
        conv("a", "2026-09-27T08:00:00", "users table"),
        conv("b", "2026-09-27T09:00:00", "orders"),
      ],
      "orders",
      NOW,
    );
    expect(groups.flatMap((g) => g.items.map((c) => c.id))).toEqual(["b"]);
  });
});
