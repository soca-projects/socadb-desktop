import type { z } from "zod";
import type { Schema } from "../types/schema";
import { fold, historyGroup, type HistoryGroup } from "./conversationHistory";
import type { FileStateZ, HomeSortZ } from "./zodSchemas";

export type HomeSort = z.infer<typeof HomeSortZ>;
export type FileState = z.infer<typeof FileStateZ>;

export interface HomeEntry {
  path: string;
  name: string;
  folder: string;
  openedAt: number;
  modifiedAt: number | null;
  state: FileState;
  schema: Schema | null;
}

export interface HomeGroup {
  key: HistoryGroup | "all";
  entries: HomeEntry[];
}

export type CurrentBadge = "draft" | "modified" | "open";

const GROUP_ORDER: HistoryGroup[] = ["today", "yesterday", "week", "month", "older"];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function splitSchemaPath(path: string): { name: string; folder: string } {
  const parts = path.split(/[/\\]/).filter(Boolean);
  const file = parts.pop() ?? path;
  return { name: file.replace(/\.soca$/i, ""), folder: parts.pop() ?? "" };
}

export function matchesEntry(
  entry: Pick<HomeEntry, "name" | "folder" | "schema">,
  query: string,
): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return (
    fold(entry.name).includes(q) ||
    fold(entry.folder).includes(q) ||
    (entry.schema?.tables.some((t) => fold(t.name).includes(q)) ?? false)
  );
}

function timeOf(entry: HomeEntry, sort: HomeSort): number {
  return sort === "modified" ? (entry.modifiedAt ?? 0) : entry.openedAt;
}

export function sortEntries(entries: readonly HomeEntry[], sort: HomeSort): HomeEntry[] {
  const copy = [...entries];
  if (sort === "name") {
    return copy.sort(
      (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
        a.folder.localeCompare(b.folder),
    );
  }
  return copy.sort((a, b) => timeOf(b, sort) - timeOf(a, sort));
}

export function groupEntries(
  entries: readonly HomeEntry[],
  sort: HomeSort,
  now: Date,
): HomeGroup[] {
  if (entries.length === 0) return [];
  if (sort === "name") return [{ key: "all", entries: [...entries] }];
  return GROUP_ORDER.map((key) => ({
    key,
    entries: entries.filter(
      (e) => historyGroup(new Date(timeOf(e, sort)).toISOString(), now) === key,
    ),
  })).filter((g) => g.entries.length > 0);
}

export function relativeTime(time: number, now: Date, locale: string): string | null {
  const elapsed = now.getTime() - time;
  if (elapsed < MINUTE) return null;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), "hour");
  const days = Math.floor(elapsed / DAY);
  if (days < 30) return format.format(-days, "day");
  if (days < 365) return format.format(-Math.floor(days / 30), "month");
  return format.format(-Math.floor(days / 365), "year");
}

export function currentBadge(filePath: string | null, dirty: boolean): CurrentBadge {
  if (filePath === null) return "draft";
  return dirty ? "modified" : "open";
}

export function nextCardIndex(
  index: number,
  key: string,
  columns: number,
  count: number,
): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const delta =
    key === "ArrowLeft"
      ? -1
      : key === "ArrowRight"
        ? 1
        : key === "ArrowUp"
          ? -columns
          : key === "ArrowDown"
            ? columns
            : null;
  if (delta === null) return null;
  const next = index + delta;
  return next >= 0 && next < count ? next : null;
}
