import { WebSocket } from "ws";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { z } from "zod";
import { mcpLog } from "./log.js";

export const APP_NOT_OPEN = "SocaDB isn't open. Ask the user to open SocaDB, then try again.";
export const APP_NOT_ANSWERING =
  "SocaDB didn't answer: it may still be starting. Try again in a few seconds; if it keeps happening, ask the user to restart SocaDB.";

const CONNECT_TIMEOUT_MS = 3_000;
const HELLO_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 10_000;

const client = process.argv.includes("--chat") ? "chat" : "external";

const HelloZ = z.object({ app: z.literal("socadb"), version: z.string().nullable() });

class AppError extends Error {}
class AppUnavailable extends Error {}
class RequestTimeout extends Error {}

let ws: WebSocket | null = null;
let connecting: Promise<WebSocket> | null = null;
let appVersion: string | null = null;
let requestId = 0;
const pending = new Map<
  number,
  {
    socket: WebSocket;
    action: string;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function readPort(): number | null {
  const portFile = join(homedir(), ".socadb", ".port");
  let content: string;
  try {
    content = readFileSync(portFile, "utf-8").trim();
  } catch {
    mcpLog.info("mcp.server.app_not_running", "No ~/.socadb/.port file");
    return null;
  }
  const port = parseInt(content, 10);
  if (!Number.isInteger(port) || port <= 0) {
    mcpLog.error("mcp.server.port_invalid", "The port file holds no valid port", { content });
    return null;
  }
  return port;
}

function rejectPending(socket: WebSocket, reason: string) {
  for (const [id, handler] of pending) {
    if (handler.socket !== socket) continue;
    clearTimeout(handler.timer);
    pending.delete(id);
    handler.reject(new Error(reason));
  }
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) return String(err.message);
  return String(err);
}

// Bun's own WebSocket client, which the compiled binary uses, can emit "error"
// more than once: an emit with no listener left would end this process.
function attach(socket: WebSocket, port: number) {
  socket.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const handler = pending.get(msg.id);
      if (!handler) return;
      clearTimeout(handler.timer);
      pending.delete(msg.id);
      if (msg.error) {
        mcpLog.warn("mcp.server.request_failed", String(msg.error).replace(/"(?:[^"\\]|\\.)*"/g, '"…"'), {
          action: handler.action,
        });
        handler.reject(new AppError(msg.error));
      } else {
        handler.resolve(msg.result);
      }
    } catch (e) {
      console.error("Failed to parse WebSocket message:", e);
    }
  });

  socket.on("error", (err) => {
    console.error("WebSocket error:", errorText(err));
    mcpLog.error("mcp.server.socket_error", errorText(err), { port });
  });

  socket.on("close", () => {
    const lost = [...pending.values()].filter((h) => h.socket === socket).length;
    if (ws === socket) {
      ws = null;
      console.error("Disconnected from SocaDB");
      mcpLog.warn("mcp.server.disconnected", "Disconnected from SocaDB", { pending: lost });
    }
    rejectPending(socket, APP_NOT_OPEN);
  });
}

function request(
  socket: WebSocket,
  action: string,
  payload: unknown,
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      if (!pending.delete(id)) return;
      mcpLog.warn("mcp.server.request_timeout", action);
      reject(new RequestTimeout(`Request ${action} timed out`));
    }, timeoutMs);
    pending.set(id, { socket, action, resolve, reject, timer });
    socket.send(JSON.stringify({ id, action, payload, client }));
  });
}

function openSocket(port: number): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, {
    handshakeTimeout: CONNECT_TIMEOUT_MS,
  });
  attach(socket, port);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("No WebSocket handshake"));
    }, CONNECT_TIMEOUT_MS);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once("close", () => {
      clearTimeout(timer);
      reject(new Error("Closed before opening"));
    });
  });
}

// A port file left by a SocaDB that crashed can point at a port another program
// took since: only an answer to hello in SocaDB's own format proves it's SocaDB.
async function connect(): Promise<WebSocket> {
  const port = readPort();
  if (port === null) throw new AppUnavailable(APP_NOT_OPEN);
  let socket: WebSocket;
  try {
    socket = await openSocket(port);
  } catch {
    throw new AppUnavailable(APP_NOT_OPEN);
  }
  try {
    const hello = HelloZ.safeParse(await request(socket, "hello", undefined, HELLO_TIMEOUT_MS));
    if (!hello.success) throw new Error("Not SocaDB");
    appVersion = hello.data.version;
  } catch (e) {
    // Versions before hello answer "Unknown action", still in SocaDB's format.
    if (!(e instanceof AppError)) {
      mcpLog.warn("mcp.server.not_socadb", errorText(e), { port });
      socket.terminate();
      // SocaDB writes its port file before its window listens: a launching app
      // accepts the connection but can't answer yet.
      throw new AppUnavailable(e instanceof RequestTimeout ? APP_NOT_ANSWERING : APP_NOT_OPEN);
    }
    appVersion = null;
  }
  ws = socket;
  console.error(`Connected to SocaDB on port ${port}`);
  mcpLog.info("mcp.server.connected", "Connected to SocaDB", { port, client });
  return socket;
}

function ensureConnected(): Promise<WebSocket> {
  if (ws?.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  connecting ??= connect().finally(() => {
    connecting = null;
  });
  return connecting;
}

export async function send(action: string, payload?: unknown): Promise<unknown> {
  let socket: WebSocket;
  try {
    socket = await ensureConnected();
  } catch (e) {
    throw e instanceof AppUnavailable ? new Error(e.message) : e;
  }
  return request(socket, action, payload, REQUEST_TIMEOUT_MS);
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

export function updateNotice(): string | null {
  const own = process.env.SOCADB_VERSION;
  if (!own || !appVersion || !isNewer(appVersion, own)) return null;
  return `SocaDB was updated to ${appVersion}, but this connection still runs ${own}: ask the user to restart this app to get SocaDB's latest tools.`;
}

export function disconnect(): Promise<void> {
  const socket = ws;
  if (!socket) return Promise.resolve();
  ws = null;
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.close(1000);
  });
}

export function isChatClient(): boolean {
  return client === "chat";
}
