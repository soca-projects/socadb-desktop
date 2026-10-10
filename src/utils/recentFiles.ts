import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { emit } from "@tauri-apps/api/event";
import { z } from "zod";
import { getSocadbDir } from "./socadbDir";

export const MAX_RECENT = 1000;

const RecentEntryZ = z.object({
  path: z.string(),
  openedAt: z.string(),
});

const RecentFileZ = z.object({
  files: z.array(RecentEntryZ),
});

export interface RecentEntry {
  path: string;
  openedAt: string;
}

let recentList: readonly RecentEntry[] = [];
const listeners = new Set<() => void>();

// No defensive copy: useSyncExternalStore re-renders forever if each call returns a new array.
export function getRecentFiles(): readonly RecentEntry[] {
  return recentList;
}

export function subscribeRecentFiles(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function update(next: readonly RecentEntry[]) {
  recentList = next;
  void persistRecent();
  void emit("refresh-menu");
  notify();
}

export function addRecentFile(path: string) {
  if (recentList[0]?.path === path) return;
  update(
    [
      { path, openedAt: new Date().toISOString() },
      ...recentList.filter((f) => f.path !== path),
    ].slice(0, MAX_RECENT),
  );
}

export function removeRecentFile(path: string) {
  removeRecentFiles([path]);
}

export function removeRecentFiles(paths: readonly string[]) {
  const drop = new Set(paths);
  const next = recentList.filter((f) => !drop.has(f.path));
  if (next.length !== recentList.length) update(next);
}

export function replaceRecentFile(oldPath: string, newPath: string) {
  if (oldPath === newPath || !recentList.some((f) => f.path === oldPath)) return;
  update(
    recentList
      .filter((f) => f.path !== newPath)
      .map((f) => (f.path === oldPath ? { ...f, path: newPath } : f)),
  );
}

export function clearRecentFiles() {
  update([]);
}

async function recentFilePath(): Promise<string> {
  return await join(await getSocadbDir(), "recent.json");
}

async function ensureSocadbDir() {
  const dir = await getSocadbDir();
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
}

async function persistRecent() {
  try {
    await ensureSocadbDir();
    const data = JSON.stringify({ files: recentList });
    await writeTextFile(await recentFilePath(), data);
  } catch (err) {
    console.warn("[recentFiles] failed to persist:", err);
  }
}

export async function loadRecentFiles() {
  try {
    const content = await readTextFile(await recentFilePath());
    const parsed = RecentFileZ.safeParse(JSON.parse(content));
    if (parsed.success) {
      recentList = parsed.data.files.slice(0, MAX_RECENT);
    } else {
      recentList = [];
    }
  } catch {
    // No recent.json yet (first launch or never persisted) — start with empty list.
    recentList = [];
  }
  notify();
}
