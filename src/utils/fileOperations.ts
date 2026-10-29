import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Schema } from "../types/schema";
import { useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import { SchemaZ } from "./zodSchemas";
import i18next from "../i18n";
import { addRecentFile, removeRecentFile } from "./recentFiles";
import { IS_MAC } from "./platform";
import { pathForLog } from "./logPrivacy";
import { logError, logInfo, logWarn } from "./log";
import { normalizeSchema } from "./schemaIntegrity";
import { replaceSchema } from "./schemaActions";

export function migrateSchema(data: unknown) {
  if (!data || typeof data !== "object") return;
  const schema = data as Record<string, unknown>;
  if (!schema.dbType) schema.dbType = "postgresql";
  if (!Array.isArray(schema.tables)) return;
  for (const table of schema.tables) {
    if (!table || typeof table !== "object") continue;
    const cols = (table as Record<string, unknown>).columns;
    if (!Array.isArray(cols)) continue;
    for (const col of cols) {
      if (!col || typeof col !== "object") continue;
      const c = col as Record<string, unknown>;
      if (c.isAutoIncrement === undefined) {
        c.isAutoIncrement = c.defaultValue === "AUTO_INCREMENT";
        if (c.defaultValue === "AUTO_INCREMENT") c.defaultValue = null;
      }
    }
  }
}

export function getSocaFilter() {
  return { name: i18next.t("fileFilter.soca"), extensions: ["soca"] };
}

export function parseSchemaData(raw: unknown): Schema | null {
  migrateSchema(raw);
  const parsed = SchemaZ.safeParse(raw);
  return parsed.success ? normalizeSchema(parsed.data) : null;
}

export function parseSchemaContent(content: string): Schema {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(i18next.t("toast.invalidFile"));
  }
  const schema = parseSchemaData(raw);
  if (!schema) throw new Error(i18next.t("toast.invalidFile"));
  return schema;
}

async function readSchemaFromPath(filePath: string): Promise<Schema> {
  const content = await readTextFile(filePath);
  return parseSchemaContent(content);
}

export async function openSchemaFile(): Promise<{
  schema: Schema;
  path: string;
} | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [getSocaFilter()],
  });

  if (!selected) return null;

  const schema = await readSchemaFromPath(selected);
  return { schema, path: selected };
}

export async function saveSchemaFile(schema: Schema, filePath: string): Promise<void> {
  const content = JSON.stringify(schema, null, 2);
  await invoke("write_schema_file", { path: filePath, content });
}

export async function saveSchemaFileAs(schema: Schema): Promise<string | null> {
  const path = await save({
    defaultPath: `${schema.name}.soca`,
    filters: [getSocaFilter()],
  });

  if (!path) return null;

  await saveSchemaFile(schema, path);
  return path;
}

export async function saveCurrentSchema(): Promise<boolean> {
  try {
    const { schema, filePath, setFilePath, markSaved } = useSchemaStore.getState();
    if (filePath) {
      await saveSchemaFile(schema, filePath);
      markSaved();
      addRecentFile(filePath);
      logInfo("file.save", "Schema saved", { file: pathForLog(filePath) });
    } else {
      const path = await saveSchemaFileAs(schema);
      if (path) {
        setFilePath(path);
        markSaved();
        addRecentFile(path);
        logInfo("file.save", "Schema saved", { file: pathForLog(path) });
      } else {
        return false;
      }
    }
    return true;
  } catch (e) {
    logError("file.save.failed", e);
    toast.error(i18next.t("toast.saveFailed", { error: String(e) }));
    return false;
  }
}

export async function openAndApplySchema(): Promise<void> {
  try {
    const result = await openSchemaFile();
    if (result) {
      replaceSchema(result.schema, result.path);
      addRecentFile(result.path);
      useViewStore.getState().showEditor();
      logInfo("file.open", "Schema opened", {
        file: pathForLog(result.path),
        tables: result.schema.tables.length,
      });
    }
  } catch (e) {
    logError("file.open.failed", e);
    toast.error(
      e instanceof Error
        ? e.message
        : i18next.t("toast.openFailed", { error: String(e) }),
    );
  }
}

export async function openRecentFile(filePath: string): Promise<void> {
  try {
    const content = await invoke<string>("read_schema_file", { path: filePath });
    const schema = parseSchemaContent(content);
    replaceSchema(schema, filePath);
    addRecentFile(filePath);
    useViewStore.getState().showEditor();
    logInfo("file.open", "Schema opened", {
      file: pathForLog(filePath),
      tables: schema.tables.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "not_found") {
      logWarn("file.open.not_found", msg, { file: pathForLog(filePath) });
      removeRecentFile(filePath);
      toast.error(i18next.t("recent.fileNotFound"));
    } else if (msg === "permission_denied") {
      logWarn("file.open.permission_denied", msg, { file: pathForLog(filePath) });
      toast.error(
        i18next.t(IS_MAC ? "recent.permissionDeniedMac" : "recent.permissionDenied"),
      );
    } else {
      logError("file.open.failed", e, { file: pathForLog(filePath) });
      toast.error(msg || i18next.t("toast.openFailed", { error: msg }));
    }
  }
}
