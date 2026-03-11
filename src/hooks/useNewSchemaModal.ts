import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import type { DbType, Schema } from "../types/schema";

const LAST_SESSION_KEY = "socadb_last_session";

interface LastSession {
  schema: Schema;
  filePath: string | null;
}

function getInitialState(): { modal: ModalState; restored: boolean } {
  const raw = localStorage.getItem(LAST_SESSION_KEY);
  if (!raw) return { modal: "first-launch", restored: false };

  try {
    const session = JSON.parse(raw) as LastSession;
    if (!session.schema.dbType) session.schema.dbType = "postgresql";
    const { setSchema, setFilePath } = useSchemaStore.getState();
    setSchema(session.schema);
    setFilePath(session.filePath);
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

export function saveLastSession() {
  const { schema, filePath } = useSchemaStore.getState();
  const session: LastSession = { schema, filePath };
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session));
}

export function clearLastSession() {
  localStorage.removeItem(LAST_SESSION_KEY);
}

useSchemaStore.subscribe(saveLastSession);
