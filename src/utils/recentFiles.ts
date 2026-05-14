import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { emit } from "@tauri-apps/api/event";
import { z } from "zod";
import { getSocadbDir } from "./socadbDir";

export const MAX_RECENT = 10;

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

let recentList: RecentEntry[] = [];

export function getRecentFiles(): RecentEntry[] {
  return [...recentList];
}

export function addRecentFile(path: string) {
  if (recentList[0]?.path === path) return;
  recentList = recentList.filter((f) => f.path !== path);
  recentList.unshift({ path, openedAt: new Date().toISOString() });
  if (recentList.length > MAX_RECENT) {
    recentList = recentList.slice(0, MAX_RECENT);
  }
  void persistRecent();
  void emit("refresh-menu");
}

export function removeRecentFile(path: string) {
  recentList = recentList.filter((f) => f.path !== path);
  void persistRecent();
  void emit("refresh-menu");
}

export function clearRecentFiles() {
  recentList = [];
  void persistRecent();
  void emit("refresh-menu");
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
}
