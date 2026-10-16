import { createEmptySchema } from "../stores/schemaStore";
import type { DbType, Relation, Schema, Table } from "../types/schema";
import { computeAutoLayout } from "./autoLayout";
import { parseDbmlSchema } from "./importDbml";
import { parseJsonSchema } from "./importJson";
import { parseSqlDdl } from "./importSql";
import type { SqlImportResult } from "./importSql";
import { normalizeSchema } from "./schemaIntegrity";
import type { ImportIssue } from "./sqlColumns";
import { colorTables } from "./tableColors";

export type ImportFormat = "sql" | "dbml" | "json";

export type FailReason =
  | "unknown_format"
  | "unreadable"
  | "not_schema"
  | "dbml_syntax"
  | "sql_failed"
  | "no_tables"
  | "write_failed";

export interface Failure {
  reason: FailReason;
  message?: string;
}

export interface BatchFile {
  path: string;
  name: string;
  format: ImportFormat | null;
  content: string;
  detected: DbType | null;
  failure: Failure | null;
}

export type DbTypeSource = "detected" | "batch" | "asked";

export interface DbTypeChoice {
  dbType: DbType;
  source: DbTypeSource;
}

export function formatOf(path: string): ImportFormat | null {
  const ext = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
  return ext === "sql" || ext === "dbml" || ext === "json" ? ext : null;
}

export function fileNameOf(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

export function displayFolder(path: string, home: string | null): string {
  const base = home?.replace(/[/\\]+$/, "");
  if (!base) return path;
  if (path.replace(/[/\\]+$/, "") === base) return "~";
  const rest = path.slice(base.length);
  return path.startsWith(base) && /^[/\\]/.test(rest) ? `~${rest}` : path;
}

export function stemOf(path: string): string {
  return fileNameOf(path).replace(/\.[^.]+$/, "");
}

export function safeStem(name: string): string {
  const cleaned = name
    .replace(/[/\\:]/g, "-")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 200);
  return cleaned || "schema";
}

function failureOf(format: ImportFormat, e: unknown): Failure {
  const message = e instanceof Error ? e.message : String(e);
  if (format === "dbml") return { reason: "dbml_syntax", message };
  return { reason: format === "sql" ? "sql_failed" : "not_schema" };
}

export function parseSource(
  format: ImportFormat,
  content: string,
  fallback: DbType | null,
): SqlImportResult {
  if (format === "sql") return parseSqlDdl(content, fallback);
  if (format === "dbml") return parseDbmlSchema(content, fallback);
  return { ...parseJsonSchema(content), issues: [] };
}

function analyzeOne(
  path: string,
  format: ImportFormat | null,
  content: string,
): BatchFile {
  const base = { path, name: stemOf(path), format, content, detected: null };
  if (!format) return { ...base, failure: { reason: "unknown_format" } };
  try {
    const parsed = parseSource(format, content, null);
    if (parsed.tables.length === 0) return { ...base, failure: { reason: "no_tables" } };
    return { ...base, detected: parsed.detectedDbType, failure: null };
  } catch (e) {
    return { ...base, failure: failureOf(format, e) };
  }
}

export async function analyzeFiles(
  paths: readonly string[],
  read: (path: string) => Promise<string>,
): Promise<BatchFile[]> {
  const files: BatchFile[] = [];
  for (const path of paths) {
    const format = formatOf(path);
    if (!format) {
      files.push(analyzeOne(path, null, ""));
      continue;
    }
    let content: string;
    try {
      content = await read(path);
    } catch {
      files.push({
        path,
        name: stemOf(path),
        format,
        content: "",
        detected: null,
        failure: { reason: "unreadable" },
      });
      continue;
    }
    files.push(analyzeOne(path, format, content));
  }
  return files;
}

export function planDialects(files: readonly BatchFile[]): {
  known: Record<string, DbTypeChoice>;
  ask: string[];
} {
  const usable = files.filter((f) => !f.failure);
  const detected = new Set(usable.flatMap((f) => (f.detected ? [f.detected] : [])));
  const hint = detected.size === 1 ? [...detected][0] : null;
  const known: Record<string, DbTypeChoice> = {};
  const ask: string[] = [];
  for (const file of usable) {
    if (file.detected) known[file.path] = { dbType: file.detected, source: "detected" };
    else if (hint) known[file.path] = { dbType: hint, source: "batch" };
    else ask.push(file.path);
  }
  return { known, ask };
}

type Layout = (
  tables: Table[],
  relations: Relation[],
) => Promise<Record<string, { x: number; y: number }>>;

export function gridPositions(tables: Table[]): Record<string, { x: number; y: number }> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
  return Object.fromEntries(
    tables.map((t, i) => [
      t.id,
      { x: (i % columns) * 320, y: Math.floor(i / columns) * 400 },
    ]),
  );
}

export interface BuiltSchema {
  schema: Schema;
  issues: ImportIssue[];
  layoutFailed: boolean;
}

export async function buildSchema(
  parsed: SqlImportResult,
  name: string,
  dbType: DbType,
  layout: Layout = computeAutoLayout,
): Promise<BuiltSchema> {
  const tables = colorTables(parsed.tables);
  let positions: Record<string, { x: number; y: number }>;
  let layoutFailed = false;
  try {
    positions = await layout(tables, parsed.relations);
  } catch {
    positions = gridPositions(tables);
    layoutFailed = true;
  }
  const schema = createEmptySchema(name, dbType);
  schema.tables = tables.map((t) => ({ ...t, position: positions[t.id] ?? t.position }));
  schema.relations = parsed.relations;
  if (parsed.enums.length) schema.enums = parsed.enums;
  return { schema: normalizeSchema(schema), issues: parsed.issues, layoutFailed };
}

export type FileOutcome =
  | { status: "pending" }
  | { status: "running" }
  | { status: "skipped" }
  | {
      status: "done";
      savedAs: string;
      dbType: DbType;
      source: DbTypeSource;
      tables: number;
      relations: number;
      issues: ImportIssue[];
      layoutFailed: boolean;
    }
  | ({ status: "failed" } & Failure);

export class FolderRefusedError extends Error {}

export interface BatchIO {
  create: (dir: string, name: string, content: string) => Promise<string>;
  remember: (path: string) => void;
  layout?: Layout;
}

export async function runImportBatch(
  files: readonly BatchFile[],
  folder: string,
  choices: Readonly<Record<string, DbTypeChoice>>,
  io: BatchIO,
  hooks: {
    onOutcome: (path: string, outcome: FileOutcome) => void;
    shouldStop: () => boolean;
  },
): Promise<"done" | "stopped" | "folder_refused"> {
  for (const file of files) {
    const choice = choices[file.path];
    if (file.failure || !file.format || !choice) continue;
    if (hooks.shouldStop()) return "stopped";
    hooks.onOutcome(file.path, { status: "running" });
    let built: BuiltSchema;
    try {
      built = await buildSchema(
        parseSource(file.format, file.content, choice.dbType),
        file.name,
        choice.dbType,
        io.layout,
      );
    } catch (e) {
      hooks.onOutcome(file.path, { status: "failed", ...failureOf(file.format, e) });
      continue;
    }
    let savedAs: string;
    try {
      savedAs = await io.create(
        folder,
        safeStem(file.name),
        JSON.stringify(built.schema, null, 2),
      );
    } catch (e) {
      if (e instanceof FolderRefusedError) {
        hooks.onOutcome(file.path, { status: "pending" });
        return "folder_refused";
      }
      hooks.onOutcome(file.path, { status: "failed", reason: "write_failed" });
      continue;
    }
    io.remember(savedAs);
    hooks.onOutcome(file.path, {
      status: "done",
      savedAs,
      dbType: choice.dbType,
      source: choice.source,
      tables: built.schema.tables.length,
      relations: built.schema.relations.length,
      issues: built.issues,
      layoutFailed: built.layoutFailed,
    });
  }
  return "done";
}

function rank(outcome: FileOutcome | undefined): number {
  if (outcome?.status === "failed") return 0;
  if (outcome?.status === "done")
    return outcome.issues.length || outcome.layoutFailed ? 1 : 2;
  return 3;
}

export function orderOutcomes(
  paths: readonly string[],
  outcomes: Readonly<Record<string, FileOutcome>>,
): string[] {
  return [...paths].sort((a, b) => rank(outcomes[a]) - rank(outcomes[b]));
}

export interface BatchSummary {
  importable: number;
  processed: number;
  created: number;
  notImported: number;
  pending: number;
}

export function summarizeBatch(
  files: readonly BatchFile[],
  outcomes: Readonly<Record<string, FileOutcome>>,
): BatchSummary {
  const statuses = files.map((f) => outcomes[f.path]?.status);
  const count = (pick: (status: FileOutcome["status"] | undefined) => boolean) =>
    statuses.filter(pick).length;
  return {
    importable: files.filter((f) => !f.failure).length,
    processed: files.filter(
      (f) =>
        !f.failure &&
        (outcomes[f.path]?.status === "done" || outcomes[f.path]?.status === "failed"),
    ).length,
    created: count((s) => s === "done"),
    notImported: count((s) => s === "failed" || s === "skipped"),
    pending: count((s) => s === "pending"),
  };
}
