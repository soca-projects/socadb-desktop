import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentRuntimeDir,
  getMcpBinaryPath,
  mcpBinaryName,
} from "../../mcp-server/src/agent-runner-shared";

let root: string;

function layout(files: string[]): string {
  root = mkdtempSync(join(tmpdir(), "socadb-mcp-path-"));
  for (const file of files) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), "");
  }
  return root;
}

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("agent paths", () => {
  it("serves MCP from the binary the agent runs in", () => {
    const dir = layout([
      `Resources/${mcpBinaryName()}`,
      "Resources/runtime/node_modules/.keep",
    ]);
    const binary = join(dir, "Resources", mcpBinaryName());
    expect(getMcpBinaryPath("/$bunfs/root", binary)).toBe(binary);
    expect(agentRuntimeDir("/$bunfs/root", binary)).toBe(
      join(dir, "Resources", "runtime"),
    );
  });

  it("finds the dev build from the source folder", () => {
    const dir = layout([
      `mcp-server/dist/${mcpBinaryName()}`,
      "mcp-server/src/agent-runner-claude.ts",
    ]);
    const src = join(dir, "mcp-server", "src");
    expect(getMcpBinaryPath(src, "/usr/local/bin/bun")).toBe(
      join(src, "..", "dist", mcpBinaryName()),
    );
    expect(agentRuntimeDir(src, "/usr/local/bin/bun")).toBe(join(dir, "mcp-server"));
  });
});
