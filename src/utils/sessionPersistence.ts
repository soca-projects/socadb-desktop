import { useSchemaStore } from "../stores/schemaStore";

const LAST_SESSION_KEY = "socadb_last_session";

function saveLastSession() {
  const { schema, filePath } = useSchemaStore.getState();
  localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ schema, filePath }));
}

export function initSessionPersistence() {
  useSchemaStore.subscribe(saveLastSession);
}
