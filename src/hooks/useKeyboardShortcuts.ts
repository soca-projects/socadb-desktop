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

      if (e.key === "s" && e.shiftKey) {
        e.preventDefault();
        void handleSaveAs();
      } else if (e.key === "s") {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "o") {
        e.preventDefault();
        void handleOpen();
      } else if (e.key === "n") {
        e.preventDefault();
        handleNew();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleSaveAs, handleOpen, handleNew]);
}
