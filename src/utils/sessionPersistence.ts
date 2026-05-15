import { useSchemaStore } from "../stores/schemaStore";

const LAST_SESSION_KEY = "socadb_last_session";

function saveLastSession() {
  try {
    const { schema, filePath, savedAt } = useSchemaStore.getState();
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ schema, filePath, savedAt }));
  } catch {
    // localStorage full or unavailable
  }
}

let initialized = false;

export function initSessionPersistence() {
  if (initialized) return;
  initialized = true;
  useSchemaStore.subscribe(saveLastSession);
}
