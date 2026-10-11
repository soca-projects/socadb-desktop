import { WebSocket } from "ws";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { mcpLog } from "./log.js";

let ws: WebSocket | null = null;
let requestId = 0;
const pending = new Map<
  number,
  {
    action: string;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function readPort(): number {
  const portFile = join(homedir(), ".socadb", ".port");
  let content: string;
  try {
    content = readFileSync(portFile, "utf-8").trim();
  } catch {
    mcpLog.error("mcp.server.app_not_running", "No ~/.socadb/.port file");
    throw new Error("SocaDB is not running. Please open SocaDB first.");
  }
  const port = parseInt(content, 10);
  if (!Number.isInteger(port) || port <= 0) {
    mcpLog.error("mcp.server.port_invalid", "The port file holds no valid port", { content });
    throw new Error("SocaDB is not running. Please open SocaDB first.");
  }
  return port;
}

export function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = readPort();
    ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on("open", () => {
      console.error(`Connected to SocaDB on port ${port}`);
      mcpLog.info("mcp.server.connected", "Connected to SocaDB", { port });
      resolve();
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const handler = pending.get(msg.id);
        if (handler) {
          clearTimeout(handler.timer);
          pending.delete(msg.id);
          if (msg.error) {
            mcpLog.warn("mcp.server.request_failed", String(msg.error), { action: handler.action });
            handler.reject(new Error(msg.error));
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err.message);
      mcpLog.error("mcp.server.socket_error", err.message);
      reject(err);
    });

    ws.on("close", () => {
      console.error("Disconnected from SocaDB");
      mcpLog.warn("mcp.server.disconnected", "Disconnected from SocaDB", { pending: pending.size });
      ws = null;
      for (const [, handler] of pending) {
        clearTimeout(handler.timer);
        handler.reject(new Error("Disconnected from SocaDB"));
      }
      pending.clear();
    });
  });
}

export function send(action: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected to SocaDB"));
      return;
    }

    const id = ++requestId;
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        mcpLog.warn("mcp.server.request_timeout", action);
        reject(new Error(`Request ${action} timed out`));
      }
    }, 10000);

    pending.set(id, { action, resolve, reject, timer });
    ws.send(JSON.stringify({ id, action, payload }));
  });
}
