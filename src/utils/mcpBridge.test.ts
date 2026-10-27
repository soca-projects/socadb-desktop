import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_NOT_ANSWERING,
  APP_NOT_OPEN,
  send,
  updateNotice,
} from "../../mcp-server/src/bridge";

type Ws = typeof import("../../mcp-server/node_modules/@types/ws/index");
const { WebSocketServer } = createRequire(import.meta.url)(
  "../../mcp-server/node_modules/ws",
) as Ws;
type WebSocketServer = InstanceType<typeof WebSocketServer>;

let home: string;
let realHome: string | undefined;
let app: WebSocketServer | null = null;

type Reply = (msg: { id: number; action: string; client?: string }) => unknown;

const socadb =
  (version: string | null = "0.1.6"): Reply =>
  (msg) =>
    msg.action === "hello"
      ? { id: msg.id, result: { app: "socadb", version } }
      : { id: msg.id, result: { action: msg.action, client: msg.client } };

function startApp(reply: Reply, port = 0): Promise<number> {
  return new Promise((resolve) => {
    app = new WebSocketServer({ host: "127.0.0.1", port }, () => {
      const address = app?.address();
      const actual = typeof address === "object" && address ? address.port : port;
      writeFileSync(join(home, ".socadb", ".port"), String(actual));
      resolve(actual);
    });
    app.on("connection", (socket) => {
      socket.on("message", (data) => {
        const answer = reply(JSON.parse(data.toString()));
        if (answer !== undefined) socket.send(JSON.stringify(answer));
      });
    });
  });
}

// The pause lets the bridge see the socket close, as it does long before the
// next request when SocaDB really quits.
async function stopApp(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (!app) return resolve();
    for (const client of app.clients) client.terminate();
    app.close(() => resolve());
    app = null;
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
}

beforeAll(() => {
  realHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "socadb-bridge-"));
  mkdirSync(join(home, ".socadb"));
  process.env.HOME = home;
});

afterAll(() => {
  process.env.HOME = realHome;
  rmSync(home, { recursive: true, force: true });
});

afterEach(async () => {
  await stopApp();
  rmSync(join(home, ".socadb", ".port"), { force: true });
  delete process.env.SOCADB_VERSION;
});

describe("MCP bridge", () => {
  it("tells the agent to ask for SocaDB while it's closed", async () => {
    await expect(send("get_schema")).rejects.toThrow(APP_NOT_OPEN);
  });

  it("connects once SocaDB opens, and says the call comes from an AI app", async () => {
    await expect(send("get_schema")).rejects.toThrow(APP_NOT_OPEN);
    await startApp(socadb());
    await expect(send("get_schema")).resolves.toEqual({
      action: "get_schema",
      client: "external",
    });
  });

  it("reconnects after SocaDB is closed and reopened on another port", async () => {
    await startApp(socadb());
    await send("get_schema");
    await stopApp();
    await expect(send("get_schema")).rejects.toThrow(APP_NOT_OPEN);
    await startApp(socadb());
    await expect(send("get_schema")).resolves.toMatchObject({ action: "get_schema" });
  });

  it("treats a port left by a crash as closed when nothing listens there", async () => {
    const port = await startApp(socadb());
    await stopApp();
    writeFileSync(join(home, ".socadb", ".port"), String(port));
    await expect(send("get_schema")).rejects.toThrow(APP_NOT_OPEN);
  });

  it("doesn't send commands to another program that took the port", async () => {
    const received: string[] = [];
    await startApp((msg) => {
      received.push(msg.action);
      return { id: msg.id, result: { app: "something else" } };
    });
    await expect(send("delete_table", { name: "users" })).rejects.toThrow(APP_NOT_OPEN);
    expect(received).toEqual(["hello"]);
  });

  it("gives up on a program that accepts the connection but never answers", async () => {
    const silent = createServer().listen(0, "127.0.0.1");
    await new Promise((resolve) => silent.once("listening", resolve));
    const address = silent.address();
    writeFileSync(
      join(home, ".socadb", ".port"),
      String(typeof address === "object" && address ? address.port : 1),
    );
    try {
      await expect(send("get_schema")).rejects.toThrow(APP_NOT_OPEN);
    } finally {
      silent.close();
    }
  }, 10_000);

  it("says SocaDB isn't answering yet when it accepts the connection but not hello", async () => {
    await startApp(() => undefined);
    await expect(send("get_schema")).rejects.toThrow(APP_NOT_ANSWERING);
  }, 10_000);

  it("still works with a SocaDB from before hello", async () => {
    await startApp((msg) =>
      msg.action === "hello"
        ? { id: msg.id, error: "Unknown action: hello" }
        : { id: msg.id, result: "ok" },
    );
    await expect(send("get_schema")).resolves.toBe("ok");
    expect(updateNotice()).toBeNull();
  });

  it("asks for a restart when SocaDB was updated after this server started", async () => {
    await startApp(socadb("0.1.7"));
    await send("get_schema");
    process.env.SOCADB_VERSION = "0.1.6";
    expect(updateNotice()).toContain("updated to 0.1.7");
    process.env.SOCADB_VERSION = "0.1.7";
    expect(updateNotice()).toBeNull();
    process.env.SOCADB_VERSION = "0.1.10";
    expect(updateNotice()).toBeNull();
  });
});
