import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

const MCP_SRC = fileURLToPath(new URL("../../mcp-server/src/", import.meta.url));

function source(file: string): string {
  return readFileSync(MCP_SRC + file, "utf-8");
}

function chatTools(): string[] {
  const socadb = ["tools/read.ts", "tools/write.ts"].flatMap((file) =>
    [...source(file).matchAll(/registerTool\(\s*"(\w+)"/g)].map((match) => match[1]),
  );
  const builtIn =
    /\btools: \[([^\]]*)\]/.exec(source("agent-runner-claude.ts"))?.[1] ?? "";
  return [
    ...socadb,
    ...[...builtIn.matchAll(/"(\w+)"/g)].map((match) => match[1]),
  ].sort();
}

describe("tool call labels", () => {
  it("finds the tools the chat's agents get", () => {
    expect(chatTools()).toEqual(expect.arrayContaining(["create_table", "WebSearch"]));
  });

  it.each([
    ["English", en.toolCall],
    ["French", fr.toolCall],
  ])("name every tool of the chat in %s", (_, labels) => {
    expect(Object.keys(labels).sort()).toEqual(chatTools());
  });
});
