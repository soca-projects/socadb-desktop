import { describe, it, expect, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

import { toast } from "sonner";
import {
  hasLoaded,
  isOurCommand,
  launchChoice,
  notifyRegistered,
  planLaunch,
  serverArgs,
  shouldUnregister,
  statusOf,
  withoutSocadbServer,
  withSocadbServer,
} from "./mcpRegistration";

const server = {
  command: "/Applications/SocaDB.app/mcp",
  args: ["--client", "claudeCode"],
  type: "stdio",
};
const OURS = "/Applications/SocaDB.app/Contents/Resources/socadb-mcp-darwin-arm64";
const ARGS = serverArgs("codex");
const ours = { command: OURS, args: ARGS };
const installed = (command: string | null, args: string[] | null = ARGS) => ({
  installed: true,
  command,
  args,
});
const absent = { installed: false, command: null, args: null };

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

  it("adds the client argument to an entry written without it", () => {
    const config = { mcpServers: { socadb: { ...server, args: [] } } };
    expect(withSocadbServer(config, server)).toEqual({ mcpServers: { socadb: server } });
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

describe("launchChoice", () => {
  it("never adds SocaDB back once the stored choices were lost", () => {
    const missing = planLaunch(
      launchChoice(undefined, true),
      installed(null),
      ours,
      false,
    );
    expect(missing).toEqual({ register: false, choice: "removed" });
    const present = planLaunch(
      launchChoice(undefined, true),
      installed("/old/socadb-mcp"),
      ours,
      false,
    );
    expect(present.choice).toBe("on");
    expect(launchChoice(undefined, false)).toBeUndefined();
    expect(launchChoice("off", true)).toBe("off");
  });
});

describe("planLaunch", () => {
  it("registers an installed client by default and remembers it", () => {
    expect(planLaunch(undefined, installed(null), ours, true)).toEqual({
      register: true,
      choice: "on",
    });
  });

  it("treats an entry that disappeared after the client loaded it as removed by hand", () => {
    expect(planLaunch("on", installed(null), ours, false)).toEqual({
      register: false,
      choice: "removed",
    });
  });

  it("adds back an entry the client overwrote before ever loading it", () => {
    expect(planLaunch("on", installed(null), ours, true)).toEqual({
      register: true,
      choice: "on",
    });
  });

  it("never adds itself back once turned off or removed", () => {
    expect(planLaunch("off", installed(null), ours, true)).toEqual({
      register: false,
      choice: "off",
    });
    expect(planLaunch("removed", installed(null), ours, true)).toEqual({
      register: false,
      choice: "removed",
    });
  });

  it("repoints an entry left by a copy of the app that moved", () => {
    expect(
      planLaunch("on", installed("/Volumes/SocaDB/socadb-mcp-darwin-arm64"), ours, false),
    ).toEqual({
      register: true,
      choice: "on",
    });
    expect(planLaunch("on", installed(OURS), ours, false)).toEqual({
      register: false,
      choice: "on",
    });
  });

  it("adopts an entry it already wrote before choices were saved", () => {
    expect(planLaunch(undefined, installed(OURS), ours, true)).toEqual({
      register: false,
      choice: "on",
    });
  });

  it("rewrites an entry from before the client argument", () => {
    expect(planLaunch("on", installed(OURS, []), ours, false)).toEqual({
      register: true,
      choice: "on",
    });
    expect(planLaunch("on", installed(OURS, null), ours, false).register).toBe(true);
  });

  it("leaves a foreign socadb entry and an absent client alone", () => {
    expect(planLaunch(undefined, installed("npx"), ours, true)).toEqual({
      register: false,
      choice: undefined,
    });
    expect(planLaunch(undefined, absent, ours, true)).toEqual({
      register: false,
      choice: undefined,
    });
  });
});

describe("statusOf", () => {
  it("shows a client as on only when its config holds our entry", () => {
    expect(statusOf("codex", undefined, installed(OURS), true).enabled).toBe(true);
    expect(statusOf("codex", undefined, installed(null), true).enabled).toBe(false);
    expect(statusOf("codex", "off", installed(OURS), true).enabled).toBe(false);
  });

  it("shows an entry as pending until the client launches the server", () => {
    expect(statusOf("claudeDesktop", "on", installed(OURS), false).pending).toBe(true);
    expect(statusOf("claudeDesktop", "on", installed(OURS), true).pending).toBe(false);
    expect(statusOf("claudeDesktop", "off", installed(null), false).pending).toBe(false);
  });

  it("flags a removal by hand and an absent client", () => {
    expect(statusOf("claudeDesktop", "removed", installed(null), true)).toMatchObject({
      enabled: false,
      removed: true,
    });
    expect(statusOf("codex", "on", absent, false)).toMatchObject({
      installed: false,
      enabled: false,
      removed: false,
    });
  });
});

describe("hasLoaded", () => {
  it("needs a launch after the last time SocaDB wrote the entry", () => {
    expect(hasLoaded(undefined, "2026-10-27T10:00:00.000Z")).toBe(false);
    expect(hasLoaded("2026-10-27T09:00:00.000Z", "2026-10-27T10:00:00.000Z")).toBe(false);
    expect(hasLoaded("2026-10-27T11:00:00.000Z", "2026-10-27T10:00:00.000Z")).toBe(true);
  });

  it("trusts a launch when the write time is from before it was recorded", () => {
    expect(hasLoaded("2026-10-27T11:00:00.000Z", undefined)).toBe(true);
    expect(hasLoaded(undefined, undefined)).toBe(false);
  });
});

describe("notifyRegistered", () => {
  it("names every client it just added SocaDB to", () => {
    notifyRegistered(["claudeCode", "codex"]);
    expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1);
    const message = String(vi.mocked(toast.info).mock.calls[0][0]);
    expect(message).toContain("Claude Code");
    expect(message).toContain("Codex");
  });

  it("stays quiet when nothing was written", () => {
    vi.mocked(toast.info).mockClear();
    notifyRegistered([]);
    expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
  });
});

describe("shouldUnregister", () => {
  it("takes out an entry Claude Desktop put back after it was turned off", () => {
    expect(shouldUnregister("off", installed(OURS), true)).toBe(true);
  });

  it("leaves an entry the user added back by hand in the other clients", () => {
    expect(shouldUnregister("off", installed(OURS), false)).toBe(false);
  });

  it("leaves every other case alone", () => {
    expect(shouldUnregister("on", installed(OURS), true)).toBe(false);
    expect(shouldUnregister("removed", installed(OURS), true)).toBe(false);
    expect(shouldUnregister("off", installed(null), true)).toBe(false);
    expect(shouldUnregister("off", installed("npx"), true)).toBe(false);
    expect(shouldUnregister("off", absent, true)).toBe(false);
  });
});
