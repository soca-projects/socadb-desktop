import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOG_CODES } from "./logCodes";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function sources(dir: string, extensions: string[]): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((file) => extensions.some((ext) => file.endsWith(ext)))
    .filter((file) => !file.includes(".test.") && !file.includes("node_modules"))
    .map((file) => readFileSync(join(ROOT, dir, file), "utf-8"));
}

function codes(texts: string[], pattern: RegExp): string[] {
  return texts.flatMap((text) => [...text.matchAll(pattern)].map((m) => m[1]));
}

const rustCodes = codes(
  sources("src-tauri/src", [".rs"]),
  /(?:log_event!|emit|write)\(\s*(?:log::)?Level::\w+,\s*"([^"]*)"/g,
);
const mcpCodes = codes(sources("mcp-server/src", [".ts"]), /mcpLog\.\w+\(\s*"([^"]*)"/g);
const uiCodes = codes(
  sources("src", [".ts", ".tsx"]),
  /(?:log(?:Error|Warn|Info|Debug)\(|send\(\s*\w+,)\s*"([^"]*)"/g,
);

describe("log code catalogue", () => {
  it("finds the codes it checks", () => {
    expect(rustCodes).toContain("app.start");
    expect(mcpCodes).toContain("mcp.server.start");
    expect(uiCodes).toContain("ui.start");
  });

  it("knows every code the Rust and MCP code write", () => {
    const unknown = [...rustCodes, ...mcpCodes].filter((code) => !(code in LOG_CODES));
    expect(unknown).toEqual([]);
  });

  it("has no entry that nothing writes", () => {
    const used = new Set([...rustCodes, ...mcpCodes, ...uiCodes]);
    expect(Object.keys(LOG_CODES).filter((code) => !used.has(code))).toEqual([]);
  });

  it("explains every code", () => {
    for (const [code, info] of Object.entries(LOG_CODES)) {
      expect(code).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(info.meaning.length, code).toBeGreaterThan(10);
      expect(info.check.length, code).toBeGreaterThan(10);
    }
  });
});
