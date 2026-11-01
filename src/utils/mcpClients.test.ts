import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordLaunch, registeredClient } from "../../mcp-server/src/clients";

let home: string;
let realHome: string | undefined;
const launchesFile = () => join(home, ".socadb", "mcp-clients.json");
const launches = () => JSON.parse(readFileSync(launchesFile(), "utf-8"));

beforeAll(() => {
  realHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "socadb-clients-"));
  process.env.HOME = home;
});

afterAll(() => {
  process.env.HOME = realHome;
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(join(home, ".socadb"), { recursive: true, force: true });
});

describe("registeredClient", () => {
  it("reads which registered entry launched the server", () => {
    expect(registeredClient(["bun", "server", "--client", "claudeDesktop"])).toBe(
      "claudeDesktop",
    );
    expect(registeredClient(["bun", "server"])).toBeNull();
    expect(registeredClient(["bun", "server", "--chat"])).toBeNull();
    expect(registeredClient(["bun", "server", "--client", "cursor"])).toBeNull();
    expect(registeredClient(["bun", "server", "--client"])).toBeNull();
  });
});

describe("recordLaunch", () => {
  it("creates the file and keeps the other clients' launches", () => {
    recordLaunch("codex");
    recordLaunch("claudeDesktop");
    const recorded = launches();
    expect(Object.keys(recorded).sort()).toEqual(["claudeDesktop", "codex"]);
    expect(Date.parse(recorded.codex)).not.toBeNaN();
  });

  it("leaves the file alone when it can't be read for another reason", () => {
    mkdirSync(launchesFile(), { recursive: true });
    expect(() => recordLaunch("codex")).not.toThrow();
    expect(statSync(launchesFile()).isDirectory()).toBe(true);
  });

  it("starts over from a file it can't parse", () => {
    mkdirSync(join(home, ".socadb"));
    writeFileSync(launchesFile(), '{"codex": ');
    recordLaunch("claudeCode");
    expect(Object.keys(launches())).toEqual(["claudeCode"]);
  });
});
