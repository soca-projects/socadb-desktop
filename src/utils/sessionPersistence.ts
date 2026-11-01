import { useSchemaStore } from "../stores/schemaStore";
import { parseSchemaData } from "./fileOperations";
import { replaceSchema } from "./schemaActions";
import { isWorthResuming } from "./schemaQueries";
import { LastSessionZ } from "./zodSchemas";
import { logError, logWarn } from "./log";

const LAST_SESSION_KEY = "socadb_last_session";

let saveFailureLogged = false;

function saveLastSession() {
  try {
    const { schema, filePath, savedAt } = useSchemaStore.getState();
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ schema, filePath, savedAt }));
  } catch (e) {
    // Runs on every store change: one line per launch is enough.
    if (!saveFailureLogged) logError("session.save.failed", e);
    saveFailureLogged = true;
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
    const schema = parseSchemaData(session.schema);
    if (!schema) throw new Error("The saved session holds an invalid schema");
    const filePath = session.filePath ?? null;
    replaceSchema(schema, filePath);
    if (session.savedAt !== undefined)
      useSchemaStore.setState({ savedAt: session.savedAt });
    return isWorthResuming(schema, filePath);
  } catch (e) {
    logWarn("session.restore.invalid", e);
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
