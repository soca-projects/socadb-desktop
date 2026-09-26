import { describe, it, expect } from "vitest";
import { withSocadbServer } from "./mcpRegistration";

const server = { command: "/Applications/SocaDB.app/mcp", args: [], type: "stdio" };

describe("withSocadbServer", () => {
  it("adds the entry and keeps the rest of the config", () => {
    const config = { oauthAccount: { id: 1 }, mcpServers: { other: { command: "x" } } };
    expect(withSocadbServer(config, server)).toEqual({
      oauthAccount: { id: 1 },
      mcpServers: { other: { command: "x" }, socadb: server },
    });
  });

  it("repoints an entry left by a copy of the app that moved", () => {
    const config = {
      mcpServers: { socadb: { command: "/Volumes/SocaDB/mcp", env: { A: "1" } } },
    };
    expect(withSocadbServer(config, server)).toEqual({
      mcpServers: { socadb: { ...server, env: { A: "1" } } },
    });
  });

  it("returns null when the entry is already current", () => {
    expect(withSocadbServer({ mcpServers: { socadb: server } }, server)).toBeNull();
  });

  it("returns null for a config that isn't an object", () => {
    expect(withSocadbServer([], server)).toBeNull();
    expect(withSocadbServer(null, server)).toBeNull();
  });
});
