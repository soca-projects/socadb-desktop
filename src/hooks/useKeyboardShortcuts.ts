import { useEffect, useCallback } from "react";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import {
  openSchemaFile,
  saveSchemaFile,
  saveSchemaFileAs,
} from "../utils/fileOperations";

export function useKeyboardShortcuts() {
  const setSchema = useSchemaStore((s) => s.setSchema);
  const setFilePath = useSchemaStore((s) => s.setFilePath);

  const handleSave = useCallback(async () => {
    const { schema, filePath } = useSchemaStore.getState();
    if (filePath) {
      await saveSchemaFile(schema, filePath);
    } else {
      const path = await saveSchemaFileAs(schema);
      if (path) setFilePath(path);
    }
  }, [setFilePath]);

  const handleSaveAs = useCallback(async () => {
    const { schema } = useSchemaStore.getState();
    const path = await saveSchemaFileAs(schema);
    if (path) setFilePath(path);
  }, [setFilePath]);

  const handleOpen = useCallback(async () => {
    const result = await openSchemaFile();
    if (result) {
      setSchema(result.schema);
      setFilePath(result.path);
    }
  }, [setSchema, setFilePath]);

  const handleNew = useCallback(() => {
    setSchema(createEmptySchema());
    setFilePath(null);
  }, [setSchema, setFilePath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === "s" && e.shiftKey) {
        e.preventDefault();
        void handleSaveAs();
      } else if (key === "s") {
        e.preventDefault();
        void handleSave();
      } else if (key === "o") {
        e.preventDefault();
        void handleOpen();
      } else if (key === "n") {
        e.preventDefault();
        handleNew();
      } else if (key === "z" && e.shiftKey) {
        e.preventDefault();
        useSchemaStore.temporal.getState().redo();
      } else if (key === "z") {
        e.preventDefault();
        useSchemaStore.temporal.getState().undo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleSaveAs, handleOpen, handleNew]);
}
