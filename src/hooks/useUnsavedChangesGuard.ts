import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import {
  saveCurrentSchema,
  openAndApplySchema,
  openRecentFile,
} from "../utils/fileOperations";

type PendingAction = "new" | "open" | "open-recent" | null;

export function useUnsavedChangesGuard() {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const recentPathRef = useRef<string | null>(null);

  useEffect(() => {
    const unlistens = [
      listen("unsaved-guard-new", () => setPendingAction("new")),
      listen("unsaved-guard-open", () => setPendingAction("open")),
      listen<string>("unsaved-guard-open-recent", (event) => {
        recentPathRef.current = event.payload;
        setPendingAction("open-recent");
      }),
    ];
    return () => {
      for (const u of unlistens) void u.then((fn) => fn());
    };
  }, []);

  const executePendingAction = useCallback(async (action: PendingAction) => {
    if (action === "new") {
      void emit("new-schema-requested");
    } else if (action === "open") {
      void openAndApplySchema();
    } else if (action === "open-recent") {
      const path = recentPathRef.current;
      recentPathRef.current = null;
      if (path) {
        void openRecentFile(path);
      }
    }
  }, []);

  const handleCancel = useCallback(() => setPendingAction(null), []);

  const handleDiscard = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    void executePendingAction(action);
  }, [pendingAction, executePendingAction]);

  const handleSave = useCallback(async () => {
    const saved = await saveCurrentSchema();
    if (!saved) return;

    const action = pendingAction;
    setPendingAction(null);
    void executePendingAction(action);
  }, [pendingAction, executePendingAction]);

  return {
    isOpen: pendingAction !== null,
    handleCancel,
    handleDiscard,
    handleSave,
  };
}
