import { appendFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

// Not imported from the SDK: the frontend typecheck reaches this file through its test,
// without mcp-server's dependencies.
interface SessionKey {
  projectKey: string;
  sessionId: string;
  subpath?: string;
}

interface SessionStoreEntry {
  type: string;
  uuid?: string;
  timestamp?: string;
  [k: string]: unknown;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;

// Keyed by session id alone, unlike the SDK's own transcripts whose project key
// comes from the cwd: sessions must survive the app moving.
export class FileSessionStore {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly seen = new Map<string, Set<string>>();

  constructor(private readonly root: string) {}

  private sessionDir(sessionId: string): string {
    if (!SAFE_SEGMENT.test(sessionId)) throw new Error(`Invalid session id: ${sessionId}`);
    return join(this.root, sessionId);
  }

  private file(key: SessionKey): string {
    const subpath = key.subpath ?? "main";
    if (!subpath.split("/").every((part) => SAFE_SEGMENT.test(part))) {
      throw new Error(`Invalid subpath: ${subpath}`);
    }
    return join(this.sessionDir(key.sessionId), `${subpath}.jsonl`);
  }

  private async readEntries(file: string): Promise<SessionStoreEntry[] | null> {
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      return null;
    }
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SessionStoreEntry);
  }

  private async uuids(file: string): Promise<Set<string>> {
    const cached = this.seen.get(file);
    if (cached) return cached;
    const set = new Set<string>();
    for (const entry of (await this.readEntries(file)) ?? []) {
      if (typeof entry.uuid === "string") set.add(entry.uuid);
    }
    this.seen.set(file, set);
    return set;
  }

  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    const file = this.file(key);
    const next = (this.queues.get(file) ?? Promise.resolve()).then(async () => {
      const seen = await this.uuids(file);
      const lines: string[] = [];
      for (const entry of entries) {
        if (typeof entry.uuid === "string") {
          if (seen.has(entry.uuid)) continue;
          seen.add(entry.uuid);
        }
        lines.push(JSON.stringify(entry));
      }
      if (lines.length === 0) return;
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await appendFile(file, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
    });
    this.queues.set(
      file,
      next.catch(() => undefined),
    );
    return next;
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    return this.readEntries(this.file(key));
  }

  async has(sessionId: string): Promise<boolean> {
    try {
      await stat(join(this.sessionDir(sessionId), "main.jsonl"));
      return true;
    } catch {
      return false;
    }
  }

  async listSubkeys(key: { projectKey: string; sessionId: string }): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.sessionDir(key.sessionId), { recursive: true });
    } catch {
      return [];
    }
    return entries
      .map((path) => path.split("\\").join("/"))
      .filter((path) => path.endsWith(".jsonl") && path !== "main.jsonl")
      .map((path) => path.slice(0, -".jsonl".length))
      .sort();
  }

  async delete(key: SessionKey): Promise<void> {
    const target = key.subpath ? this.file(key) : this.sessionDir(key.sessionId);
    for (const cached of [...this.seen.keys()]) {
      if (cached.startsWith(target)) this.seen.delete(cached);
    }
    await rm(target, { recursive: true, force: true });
  }
}
