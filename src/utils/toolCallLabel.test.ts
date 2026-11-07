import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { toolCallLabel } from "./toolCallLabel";

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

const t = (key: string) => (key.startsWith("toolCall.") ? key.slice(9) : key);

function label(name: string, input: Record<string, unknown>) {
  return toolCallLabel({ id: "t1", name, input, result: null, isSuccess: false }, t);
}

describe("toolCallLabel", () => {
  it("names a table by its name", () => {
    expect(label("mcp__socadb__create_table", { name: "users" })).toBe(
      'create_table "users"',
    );
    expect(label("mcp__socadb__get_table", { name: "users" })).toBe('get_table "users"');
  });

  it("names a column with its table, not the table alone", () => {
    expect(label("mcp__socadb__delete_column", { table: "users", column: "email" })).toBe(
      'delete_column "users.email"',
    );
    expect(
      label("mcp__socadb__add_column", {
        table: "users",
        column: { name: "email", type: "varchar" },
      }),
    ).toBe('add_column "users.email"');
  });

  it("names an index by its name, or by its table and columns", () => {
    expect(label("mcp__socadb__add_index", { table: "users", name: "users_email" })).toBe(
      'add_index "users_email"',
    );
    expect(
      label("mcp__socadb__add_index", { table: "users", columns: ["email", "team_id"] }),
    ).toBe('add_index "users (email, team_id)"');
  });

  it("names a relation by both its ends", () => {
    expect(
      label("mcp__socadb__create_relation", {
        fromTable: "orders",
        fromColumn: "user_id",
        toTable: "users",
        toColumn: "id",
      }),
    ).toBe('create_relation "orders.user_id → users.id"');
  });

  it("names what the agent looked up on the web", () => {
    expect(label("WebSearch", { query: "postgresql uuid default" })).toBe(
      'WebSearch "postgresql uuid default"',
    );
    expect(label("WebFetch", { url: "https://example.com", prompt: "Read it" })).toBe(
      'WebFetch "https://example.com"',
    );
  });

  it("keeps an unknown tool's name and leaves out a target that isn't text", () => {
    expect(label("mcp__other__do_it", { name: { nested: true } })).toBe("do_it");
    expect(label("mcp__socadb__auto_layout", {})).toBe("auto_layout");
  });

  it("names no target rather than the table alone when a column or index is missing", () => {
    expect(label("mcp__socadb__delete_column", { table: "users" })).toBe("delete_column");
    expect(label("mcp__socadb__add_index", { table: "users", columns: "email" })).toBe(
      "add_index",
    );
  });
});
