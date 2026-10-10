import { useSchemaStore } from "../stores/schemaStore";
import { migrateSchema } from "./fileOperations";
import { isWorthResuming } from "./schemaQueries";
import { LastSessionZ, SchemaZ } from "./zodSchemas";

const LAST_SESSION_KEY = "socadb_last_session";

function saveLastSession() {
  try {
    const { schema, filePath, savedAt } = useSchemaStore.getState();
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ schema, filePath, savedAt }));
  } catch {
    // localStorage full or unavailable
  }
}

export function clearLastSession() {
  try {
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {
    // localStorage unavailable
  }
}

// Returns whether the restored schema is worth resuming: closing a schema
// leaves an empty, never-saved one behind.
export function restoreLastSession(): boolean {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LAST_SESSION_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const session = LastSessionZ.parse(JSON.parse(raw));
    migrateSchema(session.schema);
    const schema = SchemaZ.parse(session.schema);
    const filePath = session.filePath ?? null;
    const { setSchema, setFilePath } = useSchemaStore.getState();
    setSchema(schema);
    setFilePath(filePath);
    if (session.savedAt !== undefined)
      useSchemaStore.setState({ savedAt: session.savedAt });
    return isWorthResuming(schema, filePath);
  } catch {
    clearLastSession();
    return false;
  }
}

let initialized = false;

export function initSessionPersistence() {
  if (initialized) return;
  initialized = true;
  useSchemaStore.subscribe(saveLastSession);
}
