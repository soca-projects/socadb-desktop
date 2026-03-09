import { WebSocket } from "ws";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

let ws: WebSocket | null = null;
let requestId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }
>();

function readPort(): number {
  const portFile = join(homedir(), ".socadb", ".port");
  try {
    const content = readFileSync(portFile, "utf-8").trim();
    return parseInt(content, 10);
  } catch {
    throw new Error("SocaDB is not running. Please open SocaDB first.");
  }
}

export function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = readPort();
    ws = new WebSocket(`ws://127.0.0.1:${port}`);

    ws.on("open", () => {
      console.error(`Connected to SocaDB on port ${port}`);
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
      reject(err);
    });

    ws.on("close", () => {
      console.error("Disconnected from SocaDB");
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
        reject(new Error(`Request ${action} timed out`));
      }
    }, 10000);

    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, action, payload }));
  });
}
