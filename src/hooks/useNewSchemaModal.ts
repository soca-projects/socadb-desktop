import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import type { DbType } from "../types/schema";

export function useNewSchemaModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen("new-schema-requested", () => setIsOpen(true));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const handleCreate = useCallback((name: string, dbType: DbType) => {
    const { setSchema, setFilePath } = useSchemaStore.getState();
    setSchema(createEmptySchema(name, dbType));
    setFilePath(null);
    setIsOpen(false);
    useViewStore.getState().showEditor();
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  return { isOpen, handleCreate, handleClose };
}
