import { describe, it, expect } from "vitest";
import {
  currentBadge,
  groupEntries,
  matchesEntry,
  nextCardIndex,
  relativeTime,
  sortEntries,
  splitSchemaPath,
  type HomeEntry,
} from "./homeList";
import { createEmptySchema } from "../stores/schemaStore";
import type { Schema } from "../types/schema";

const NOW = new Date(2026, 9, 10, 15, 0);
const MIN = 60_000;
const DAY = 86_400_000;

function schemaWith(tables: string[]): Schema {
  const schema = createEmptySchema("s", "postgresql");
  schema.tables = tables.map((name, i) => ({
    id: `t${i}`,
    name,
    position: { x: 0, y: 0 },
    columns: [],
  }));
  return schema;
}

function entry(
  path: string,
  openedAt: number,
  modifiedAt: number | null,
  tables: string[] = [],
): HomeEntry {
  return {
    path,
    ...splitSchemaPath(path),
    openedAt,
    modifiedAt,
    exists: true,
    schema: schemaWith(tables),
  };
}

describe("splitSchemaPath", () => {
  it("splits POSIX and Windows paths", () => {
    expect(splitSchemaPath("/Users/a/shop/schema.soca")).toEqual({
      name: "schema",
      folder: "shop",
    });
    expect(splitSchemaPath("C:\\Users\\a\\crm\\Main.SOCA")).toEqual({
      name: "Main",
      folder: "crm",
    });
    expect(splitSchemaPath("schema.soca")).toEqual({ name: "schema", folder: "" });
  });
});

describe("matchesEntry", () => {
  const e = entry("/x/réservations/salles.soca", 0, 0, ["bookings", "rooms"]);
  it("matches name, folder and table names without accents", () => {
    expect(matchesEntry(e, "")).toBe(true);
    expect(matchesEntry(e, "SALLES")).toBe(true);
    expect(matchesEntry(e, "reservation")).toBe(true);
    expect(matchesEntry(e, "book")).toBe(true);
    expect(matchesEntry(e, "orders")).toBe(false);
  });
  it("handles an unreadable schema", () => {
    expect(matchesEntry({ ...e, schema: null }, "book")).toBe(false);
  });
});

describe("sortEntries", () => {
  const a = entry("/x/b-shop.soca", 3, 1);
  const b = entry("/x/a-blog.soca", 1, 3);
  const c = entry("/y/a-blog.soca", 2, null);
  it("sorts by last opened, last modified or name", () => {
    expect(sortEntries([a, b, c], "opened").map((e) => e.path)).toEqual([
      a.path,
      c.path,
      b.path,
    ]);
    expect(sortEntries([a, b, c], "modified").map((e) => e.path)).toEqual([
      b.path,
      a.path,
      c.path,
    ]);
    expect(sortEntries([a, b, c], "name").map((e) => e.path)).toEqual([
      b.path,
      c.path,
      a.path,
    ]);
  });
});

describe("groupEntries", () => {
  it("groups by the history buckets", () => {
    const today = entry("/x/today.soca", NOW.getTime() - 30 * MIN, null);
    const yesterday = entry("/x/yesterday.soca", NOW.getTime() - DAY, null);
    const old = entry("/x/old.soca", NOW.getTime() - 90 * DAY, null);
    const groups = groupEntries([today, yesterday, old], "opened", NOW);
    expect(groups.map((g) => g.key)).toEqual(["today", "yesterday", "older"]);
  });
  it("puts everything in one group when sorted by name", () => {
    const groups = groupEntries([entry("/x/a.soca", 0, 0)], "name", NOW);
    expect(groups).toEqual([
      { key: "all", entries: [expect.objectContaining({ name: "a" })] },
    ]);
  });
  it("returns no group for no entry", () => {
    expect(groupEntries([], "opened", NOW)).toEqual([]);
  });
});

describe("relativeTime", () => {
  it("speaks the user's language", () => {
    expect(relativeTime(NOW.getTime() - 20_000, NOW, "fr")).toBeNull();
    expect(relativeTime(NOW.getTime() - 25 * MIN, NOW, "fr")).toBe("il y a 25 minutes");
    expect(relativeTime(NOW.getTime() - DAY, NOW, "fr")).toBe("hier");
    expect(relativeTime(NOW.getTime() - 3 * DAY, NOW, "en")).toBe("3 days ago");
    expect(relativeTime(NOW.getTime() - 150 * DAY, NOW, "fr")).toBe("il y a 5 mois");
  });
});

describe("currentBadge", () => {
  it("tells drafts, unsaved files and open files apart", () => {
    expect(currentBadge(null, true)).toBe("draft");
    expect(currentBadge("/x/a.soca", true)).toBe("modified");
    expect(currentBadge("/x/a.soca", false)).toBe("open");
  });
});

describe("nextCardIndex", () => {
  it("moves in a grid and stops at the edges", () => {
    expect(nextCardIndex(0, "ArrowRight", 4, 10)).toBe(1);
    expect(nextCardIndex(5, "ArrowUp", 4, 10)).toBe(1);
    expect(nextCardIndex(1, "ArrowUp", 4, 10)).toBeNull();
    expect(nextCardIndex(7, "ArrowDown", 4, 10)).toBeNull();
    expect(nextCardIndex(4, "End", 4, 10)).toBe(9);
    expect(nextCardIndex(4, "Home", 4, 10)).toBe(0);
    expect(nextCardIndex(4, "a", 4, 10)).toBeNull();
  });
});
