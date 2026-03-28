import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Schema } from "../types/schema";
import { SchemaZ } from "./zodSchemas";
import i18next from "../i18n";

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

function getSocaFilter() {
  return { name: i18next.t("fileFilter.soca"), extensions: ["soca"] };
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

  const content = await readTextFile(selected);
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(i18next.t("toast.invalidFile"));
  }
  migrateSchema(raw);
  const parsed = SchemaZ.safeParse(raw);
  if (!parsed.success) {
    throw new Error(i18next.t("toast.invalidFile"));
  }
  return { schema: parsed.data, path: selected };
}

export async function saveSchemaFile(schema: Schema, filePath: string): Promise<void> {
  const content = JSON.stringify(schema, null, 2);
  await writeTextFile(filePath, content);
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
