import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { dispatchMcpAction } from "../utils/mcpActions";

export function useMcpBridge() {
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<string>("mcp-request", async (event) => {
      if (cancelled) return;
      let connectionId: number | undefined;
      let requestId: number | undefined;
      try {
        const envelope = JSON.parse(event.payload) as {
          connectionId: number;
          data: { id: number; action: string; payload?: Record<string, unknown> };
        };
        connectionId = envelope.connectionId;
        requestId = envelope.data.id;
        const { action, payload } = envelope.data;
        const result = await dispatchMcpAction(action, payload ?? {});
        const msg = result.ok
          ? { id: requestId, result: result.data }
          : { id: requestId, error: result.error };
        void invoke("mcp_respond", { connectionId, response: JSON.stringify(msg) });
      } catch (e) {
        console.error("Failed to handle MCP request:", e);
        if (connectionId != null && requestId != null) {
          const errorMsg = e instanceof Error ? e.message : "Internal error";
          void invoke("mcp_respond", {
            connectionId,
            response: JSON.stringify({ id: requestId, error: errorMsg }),
          });
        }
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);
}
