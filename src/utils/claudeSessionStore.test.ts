import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "../../mcp-server/src/claude-session-store";

const SESSION = "325a9f58-32b8-4c24-b59e-a629f854add5";
const key = { projectKey: "any", sessionId: SESSION };
let root: string;
let store: FileSessionStore;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "socadb-store-"));
  store = new FileSessionStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("FileSessionStore", () => {
  it("returns null for a session never written", async () => {
    expect(await store.load(key)).toBeNull();
    expect(await store.has(SESSION)).toBe(false);
  });

  it("appends and loads in order, ignoring a replayed uuid", async () => {
    await store.append(key, [{ type: "user", uuid: "a" }, { type: "title" }]);
    await store.append(key, [
      { type: "user", uuid: "a" },
      { type: "assistant", uuid: "b" },
    ]);
    expect(await store.load(key)).toEqual([
      { type: "user", uuid: "a" },
      { type: "title" },
      { type: "assistant", uuid: "b" },
    ]);
  });

  it("keys by session id only, whatever the project key", async () => {
    await store.append(key, [{ type: "user", uuid: "a" }]);
    expect(
      await store.load({ projectKey: "moved-app", sessionId: SESSION }),
    ).toHaveLength(1);
  });

  it("lists and deletes subagent transcripts", async () => {
    await store.append(key, [{ type: "user", uuid: "a" }]);
    await store.append({ ...key, subpath: "subagents/agent-1" }, [
      { type: "user", uuid: "s" },
    ]);
    expect(await store.listSubkeys(key)).toEqual(["subagents/agent-1"]);
    await store.delete(key);
    expect(await store.has(SESSION)).toBe(false);
    expect(await store.listSubkeys(key)).toEqual([]);
  });

  it("refuses ids and subpaths that could escape its directory", async () => {
    await expect(store.load({ projectKey: "x", sessionId: "../x" })).rejects.toThrow();
    await expect(store.load({ ...key, subpath: "../../etc/passwd" })).rejects.toThrow();
  });
});
