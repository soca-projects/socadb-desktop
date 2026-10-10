import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { Schema } from "../types/schema";
import { parseSchemaContent } from "./fileOperations";
import { splitSchemaPath, type HomeEntry } from "./homeList";
import type { RecentEntry } from "./recentFiles";
import { SchemaFileInfoZ } from "./zodSchemas";

const SchemaFileInfosZ = z.array(SchemaFileInfoZ);

const cache = new Map<string, { modifiedAt: number; schema: Schema | null }>();

async function readSchema(path: string, modifiedAt: number): Promise<Schema | null> {
  const cached = cache.get(path);
  if (cached?.modifiedAt === modifiedAt) return cached.schema;
  let schema: Schema | null = null;
  try {
    schema = parseSchemaContent(await invoke<string>("read_schema_file", { path }));
  } catch {
    schema = null;
  }
  cache.set(path, { modifiedAt, schema });
  return schema;
}

export async function loadHomeEntries(
  recents: readonly RecentEntry[],
): Promise<HomeEntry[]> {
  if (recents.length === 0) return [];
  const infos = SchemaFileInfosZ.parse(
    await invoke("schema_files_info", { paths: recents.map((r) => r.path) }),
  );
  const byPath = new Map(infos.map((info) => [info.path, info]));
  return Promise.all(
    recents.map(async (recent) => {
      const info = byPath.get(recent.path);
      const exists = info?.exists ?? false;
      const modifiedAt = exists ? (info?.modifiedMs ?? null) : null;
      const openedAt = Date.parse(recent.openedAt);
      return {
        path: recent.path,
        ...splitSchemaPath(recent.path),
        openedAt: Number.isFinite(openedAt) ? openedAt : 0,
        modifiedAt,
        exists,
        schema: exists ? await readSchema(recent.path, modifiedAt ?? -1) : null,
      };
    }),
  );
}
