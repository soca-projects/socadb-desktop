import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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

describe("getMcpBinaryPath", () => {
  it("finds the bundled binary next to the runtime folder", () => {
    const dir = layout([
      `Resources/${mcpBinaryName()}`,
      "Resources/runtime/agent-runner-claude.ts",
    ]);
    expect(getMcpBinaryPath(join(dir, "Resources", "runtime"))).toBe(
      join(dir, "Resources", "runtime", "..", mcpBinaryName()),
    );
  });

  it("ignores a copy left in the runtime folder by an earlier version", () => {
    const dir = layout([
      `Resources/${mcpBinaryName()}`,
      `Resources/runtime/${mcpBinaryName()}`,
    ]);
    expect(getMcpBinaryPath(join(dir, "Resources", "runtime"))).toBe(
      join(dir, "Resources", mcpBinaryName()),
    );
  });

  it("finds the dev build from the source folder", () => {
    const dir = layout([
      `mcp-server/dist/${mcpBinaryName()}`,
      "mcp-server/src/agent-runner-claude.ts",
    ]);
    expect(getMcpBinaryPath(join(dir, "mcp-server", "src"))).toBe(
      join(dir, "mcp-server", "src", "..", "dist", mcpBinaryName()),
    );
  });
});
