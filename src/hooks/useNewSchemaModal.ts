import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import { migrateSchema } from "../utils/fileOperations";
import { SchemaZ } from "../utils/zodSchemas";
import type { DbType } from "../types/schema";

const LAST_SESSION_KEY = "socadb_last_session";

function getInitialState(): { modal: ModalState; restored: boolean } {
  const raw = localStorage.getItem(LAST_SESSION_KEY);
  if (!raw) return { modal: "first-launch", restored: false };

  try {
    const session = JSON.parse(raw);
    if (!session?.schema) throw new Error("No schema in session");
    migrateSchema(session.schema);
    const parsed = SchemaZ.safeParse(session.schema);
    if (!parsed.success) throw new Error("Invalid session schema");
    const { setSchema, setFilePath } = useSchemaStore.getState();
    setSchema(parsed.data);
    setFilePath(session.filePath ?? null);
    if (typeof session.savedAt === "string" || session.savedAt === null) {
      useSchemaStore.setState({ savedAt: session.savedAt });
    }
    return { modal: null, restored: true };
  } catch {
    localStorage.removeItem(LAST_SESSION_KEY);
    return { modal: "first-launch", restored: false };
  }
}

type ModalState = "first-launch" | "new-schema" | null;

export function useNewSchemaModal() {
  const [modal, setModal] = useState<ModalState>(() => getInitialState().modal);

  useEffect(() => {
    const unlisten = listen("new-schema-requested", () => {
      setModal("new-schema");
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const handleCreate = useCallback((name: string, dbType: DbType) => {
    const { setSchema, setFilePath } = useSchemaStore.getState();
    setSchema(createEmptySchema(name, dbType));
    setFilePath(null);
    localStorage.removeItem(LAST_SESSION_KEY);
    setModal(null);
  }, []);

  const handleClose = useCallback(() => setModal(null), []);

  return {
    isOpen: modal !== null,
    isFirstLaunch: modal === "first-launch",
    handleCreate,
    handleClose,
  };
}
