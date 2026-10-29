import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import {
  saveCurrentSchema,
  openAndApplySchema,
  openRecentFile,
} from "../utils/fileOperations";
import { importDraft } from "../utils/homeImport";
import { dropPendingReplace, runPendingReplace } from "../utils/importApply";
import { closeSchema } from "../utils/schemaActions";

type PendingAction =
  "new" | "open" | "open-recent" | "close" | "import-file" | "replace-import" | null;

export function useUnsavedChangesGuard() {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const recentPathRef = useRef<string | null>(null);
  const importPathRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingAction>(null);

  useEffect(() => {
    pendingRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    const unlistens = [
      listen("unsaved-guard-new", () => setPendingAction("new")),
      listen("unsaved-guard-open", () => setPendingAction("open")),
      listen("unsaved-guard-close", () => setPendingAction("close")),
      listen("unsaved-guard-replace-import", () => setPendingAction("replace-import")),
      listen<string>("unsaved-guard-import-file", (event) => {
        if (pendingRef.current) return;
        importPathRef.current = event.payload;
        setPendingAction("import-file");
      }),
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
    } else if (action === "close") {
      closeSchema();
    } else if (action === "import-file") {
      const path = importPathRef.current;
      importPathRef.current = null;
      if (path) void importDraft(path);
    } else if (action === "replace-import") {
      runPendingReplace();
    }
  }, []);

  const handleCancel = useCallback(() => {
    dropPendingReplace();
    setPendingAction(null);
  }, []);

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
