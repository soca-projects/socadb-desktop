import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { dispatchMcpAction } from "../utils/mcpActions";
import { logDebug, logError, logInfo } from "../utils/log";

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
        const started = performance.now();
        const result = await dispatchMcpAction(action, payload ?? {});
        const outcome = {
          ok: result.ok,
          ms: Math.round(performance.now() - started),
          error: result.ok ? undefined : result.error,
        };
        if (action.startsWith("dev_")) logDebug("mcp.tool", action, outcome);
        else logInfo("mcp.tool", action, outcome);
        const msg = result.ok
          ? { id: requestId, result: result.data }
          : { id: requestId, error: result.error };
        invoke("mcp_respond", { connectionId, response: JSON.stringify(msg) }).catch(
          (e: unknown) => logError("mcp.respond.failed", e),
        );
      } catch (e) {
        logError("mcp.request.failed", e);
        if (connectionId != null && requestId != null) {
          const errorMsg = e instanceof Error ? e.message : "Internal error";
          invoke("mcp_respond", {
            connectionId,
            response: JSON.stringify({ id: requestId, error: errorMsg }),
          }).catch((err: unknown) => logError("mcp.respond.failed", err));
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
