import { describe, it, expect } from "vitest";
import {
  isOurCommand,
  planLaunch,
  statusOf,
  withoutSocadbServer,
  withSocadbServer,
} from "./mcpRegistration";

const server = { command: "/Applications/SocaDB.app/mcp", args: [], type: "stdio" };
const OURS = "/Applications/SocaDB.app/Contents/Resources/socadb-mcp-darwin-arm64";
const installed = (command: string | null) => ({ installed: true, command });

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

  it("keeps the client's key order", () => {
    const config = { numStartups: 3, mcpServers: {}, theme: "dark" };
    expect(Object.keys(withSocadbServer(config, server) ?? {})).toEqual([
      "numStartups",
      "mcpServers",
      "theme",
    ]);
    expect(Object.keys(withSocadbServer({ numStartups: 3 }, server) ?? {})).toEqual([
      "numStartups",
      "mcpServers",
    ]);
  });

  it("returns null when the entry is already current", () => {
    expect(withSocadbServer({ mcpServers: { socadb: server } }, server)).toBeNull();
  });

  it("returns null for a config that isn't an object", () => {
    expect(withSocadbServer([], server)).toBeNull();
    expect(withSocadbServer(null, server)).toBeNull();
  });
});

describe("withoutSocadbServer", () => {
  it("removes only the socadb entry", () => {
    const config = {
      theme: "dark",
      mcpServers: { other: { command: "x" }, socadb: server },
    };
    expect(withoutSocadbServer(config)).toEqual({
      theme: "dark",
      mcpServers: { other: { command: "x" } },
    });
  });

  it("returns null when there is nothing to remove", () => {
    expect(withoutSocadbServer({ mcpServers: { other: { command: "x" } } })).toBeNull();
    expect(withoutSocadbServer({})).toBeNull();
  });
});

describe("isOurCommand", () => {
  it("recognizes the bundled server from any install location", () => {
    expect(isOurCommand(OURS)).toBe(true);
    expect(
      isOurCommand("/Volumes/SocaDB/SocaDB.app/Contents/Resources/socadb-mcp-darwin-x64"),
    ).toBe(true);
    expect(isOurCommand("C:\\Program Files\\SocaDB\\socadb-mcp-windows-x64.exe")).toBe(
      true,
    );
  });

  it("leaves a server someone else named socadb alone", () => {
    expect(isOurCommand("npx")).toBe(false);
    expect(isOurCommand("/usr/local/bin/my-socadb")).toBe(false);
  });
});

describe("planLaunch", () => {
  it("registers an installed client by default and remembers it", () => {
    expect(planLaunch(undefined, installed(null), OURS)).toEqual({
      register: true,
      choice: "on",
    });
  });

  it("treats a registered entry that disappeared as removed by hand", () => {
    expect(planLaunch("on", installed(null), OURS)).toEqual({
      register: false,
      choice: "removed",
    });
  });

  it("never adds itself back once turned off or removed", () => {
    expect(planLaunch("off", installed(null), OURS)).toEqual({
      register: false,
      choice: "off",
    });
    expect(planLaunch("removed", installed(null), OURS)).toEqual({
      register: false,
      choice: "removed",
    });
  });

  it("repoints an entry left by a copy of the app that moved", () => {
    expect(
      planLaunch("on", installed("/Volumes/SocaDB/socadb-mcp-darwin-arm64"), OURS),
    ).toEqual({
      register: true,
      choice: "on",
    });
    expect(planLaunch("on", installed(OURS), OURS)).toEqual({
      register: false,
      choice: "on",
    });
  });

  it("adopts an entry it already wrote before choices were saved", () => {
    expect(planLaunch(undefined, installed(OURS), OURS)).toEqual({
      register: false,
      choice: "on",
    });
  });

  it("leaves a foreign socadb entry and an absent client alone", () => {
    expect(planLaunch(undefined, installed("npx"), OURS)).toEqual({
      register: false,
      choice: undefined,
    });
    expect(planLaunch(undefined, { installed: false, command: null }, OURS)).toEqual({
      register: false,
      choice: undefined,
    });
  });
});

describe("statusOf", () => {
  it("shows a client as on only when its config holds our entry", () => {
    expect(statusOf("codex", undefined, installed(OURS)).enabled).toBe(true);
    expect(statusOf("codex", undefined, installed(null)).enabled).toBe(false);
    expect(statusOf("codex", "off", installed(OURS)).enabled).toBe(false);
  });

  it("flags a removal by hand and an absent client", () => {
    expect(statusOf("claudeDesktop", "removed", installed(null))).toMatchObject({
      enabled: false,
      removed: true,
    });
    expect(statusOf("codex", "on", { installed: false, command: null })).toMatchObject({
      installed: false,
      enabled: false,
      removed: false,
    });
  });
});
