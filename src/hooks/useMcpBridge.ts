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
      try {
        const { id, action, payload } = JSON.parse(event.payload) as {
          id: number;
          action: string;
          payload?: Record<string, unknown>;
        };
        const result = await dispatchMcpAction(action, payload ?? {});
        const msg = result.ok ? { id, result: result.data } : { id, error: result.error };
        void invoke("mcp_respond", { response: JSON.stringify(msg) });
      } catch (e) {
        console.error("Failed to handle MCP request:", e);
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
