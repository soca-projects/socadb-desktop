import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Schema } from "../types/schema";

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
  const schema = JSON.parse(content) as Schema;
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
