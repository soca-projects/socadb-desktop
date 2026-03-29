import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { saveCurrentSchema, openAndApplySchema } from "../utils/fileOperations";

type PendingAction = "new" | "open" | null;

export function useUnsavedChangesGuard() {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    const unlistens = [
      listen("unsaved-guard-new", () => setPendingAction("new")),
      listen("unsaved-guard-open", () => setPendingAction("open")),
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
