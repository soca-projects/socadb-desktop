import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { z } from "zod";
import { mcpLog } from "./log.js";

const REGISTERED = ["claudeCode", "claudeDesktop", "codex"];

const LaunchesZ = z.record(z.string(), z.string());

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function registeredClient(argv: readonly string[] = process.argv): string | null {
  const index = argv.indexOf("--client");
  const id = index >= 0 ? argv[index + 1] : undefined;
  return id !== undefined && REGISTERED.includes(id) ? id : null;
}

// Claude Desktop can drop an entry SocaDB wrote while it ran, rewriting the
// config it read at launch. A launch recorded here tells SocaDB the app loaded
// the entry, so a later removal is the user's and not written back.
export function recordLaunch(id: string) {
  const dir = join(homedir(), ".socadb");
  const file = join(dir, "mcp-clients.json");
  try {
    let launches: Record<string, string> = {};
    let content: string | null = null;
    try {
      content = readFileSync(file, "utf-8");
    } catch (e) {
      // Writing anyway would drop the other clients' launches.
      if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
    }
    if (content !== null) {
      const parsed = LaunchesZ.safeParse(parseJson(content));
      if (parsed.success) launches = parsed.data;
      else
        mcpLog.warn("mcp.server.launch_record_failed", "mcp-clients.json was unreadable and starts over", {
          client: id,
        });
    }
    launches[id] = new Date().toISOString();
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(launches));
    renameSync(tmp, file);
  } catch (e) {
    mcpLog.warn("mcp.server.launch_record_failed", e instanceof Error ? e.message : String(e), {
      client: id,
    });
  }
}
