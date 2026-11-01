import { invoke } from "@tauri-apps/api/core";
import { useSchemaStore } from "../stores/schemaStore";
import { IS_MAC } from "./platform";
import { hasUnsavedChanges } from "./schemaQueries";
import { logWarn } from "./log";

let edited = false;

function syncDocumentEdited() {
  const { schema, filePath, savedAt } = useSchemaStore.getState();
  const next = hasUnsavedChanges(schema, filePath, savedAt);
  if (next === edited) return;
  edited = next;
  invoke("set_document_edited", { edited }).catch((e: unknown) =>
    logWarn("window.document_edited.failed", e),
  );
}

export function initDocumentEdited() {
  if (!IS_MAC) return;
  syncDocumentEdited();
  useSchemaStore.subscribe(syncDocumentEdited);
}
