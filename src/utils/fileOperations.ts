import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Schema } from "../types/schema";

export function migrateSchema(schema: Schema) {
  if (!schema.dbType) schema.dbType = "postgresql";
  for (const table of schema.tables) {
    for (const col of table.columns) {
      if (col.isAutoIncrement === undefined) {
        (col as { isAutoIncrement: boolean }).isAutoIncrement =
          col.defaultValue === "AUTO_INCREMENT";
        if (col.defaultValue === "AUTO_INCREMENT") col.defaultValue = null;
      }
    }
  }
}

const SOCA_FILTER = {
  name: "SocaDB Schema",
  extensions: ["soca"],
};

export async function openSchemaFile(): Promise<{
  schema: Schema;
  path: string;
} | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [SOCA_FILTER],
  });

  if (!selected) return null;

  const content = await readTextFile(selected);
  let schema: Schema;
  try {
    schema = JSON.parse(content) as Schema;
  } catch {
    throw new Error("Invalid .soca file: could not parse JSON");
  }
  migrateSchema(schema);
  return { schema, path: selected };
}

export async function saveSchemaFile(schema: Schema, filePath: string): Promise<void> {
  const content = JSON.stringify(schema, null, 2);
  await writeTextFile(filePath, content);
}

export async function saveSchemaFileAs(schema: Schema): Promise<string | null> {
  const path = await save({
    defaultPath: `${schema.name}.soca`,
    filters: [SOCA_FILTER],
  });

  if (!path) return null;

  await saveSchemaFile(schema, path);
  return path;
}
