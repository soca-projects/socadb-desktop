import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { dispatchMcpAction } from "../utils/mcpActions";
import { logDebug, logError, logInfo, logWarn } from "../utils/log";
import { maskQuoted } from "../utils/logPrivacy";
import { McpRequestZ } from "../utils/zodSchemas";

export function useMcpBridge() {
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<string>("mcp-request", async (event) => {
      if (cancelled) return;
      let connectionId: number | undefined;
      let requestId: number | undefined;
      try {
        const envelope = McpRequestZ.parse(JSON.parse(event.payload));
        connectionId = envelope.connectionId;
        requestId = envelope.data.id;
        const { action, payload, client } = envelope.data;
        const started = performance.now();
        const result = await dispatchMcpAction(
          action,
          payload ?? {},
          client ?? "external",
        );
        const ms = Math.round(performance.now() - started);
        if (!result.ok) {
          logWarn("mcp.tool.failed", action, { ms, error: maskQuoted(result.error) });
        } else if (action.startsWith("dev_")) {
          logDebug("mcp.tool", action, { ms });
        } else {
          logInfo("mcp.tool", action, { ms });
        }
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
