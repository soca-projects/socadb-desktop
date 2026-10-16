import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { dirname } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import i18next from "../i18n";
import { resetImportFlow, useImportFlowStore } from "../stores/importFlowStore";
import { useSchemaStore } from "../stores/schemaStore";
import type { DbType } from "../types/schema";
import { replaceWithImport, showImportSummary } from "./importApply";
import {
  analyzeFiles,
  FolderRefusedError,
  parseSource,
  planDialects,
  runImportBatch,
} from "./importFiles";
import type { BatchFile, FileOutcome } from "./importFiles";
import { logError, logInfo, logWarn } from "./log";
import { addRecentFile } from "./recentFiles";
import { isWorthResuming } from "./schemaQueries";

const filters = () => [
  { name: i18next.t("import.schemaFiles"), extensions: ["sql", "dbml", "json"] },
];

function draftIsDirty() {
  const { schema, filePath, savedAt } = useSchemaStore.getState();
  return savedAt !== schema.updatedAt && isWorthResuming(schema, filePath);
}

function logFailure(file: BatchFile) {
  if (!file.failure) return;
  logWarn("import.batch.file_failed", file.failure.reason, {
    reason: file.failure.reason,
    format: file.format ?? "unknown",
  });
}

export async function importFromHome() {
  const picked = await open({ multiple: true, directory: false, filters: filters() });
  if (!picked?.length) return;
  if (picked.length === 1) {
    if (draftIsDirty()) void emit("unsaved-guard-import-file", picked[0]);
    else await importDraft(picked[0]);
    return;
  }
  const folder = await open({
    directory: true,
    multiple: false,
    defaultPath: await dirname(picked[0]),
  });
  if (typeof folder !== "string") return;
  const files = await analyzeFiles(picked, readTextFile);
  files.forEach(logFailure);
  const plan = planDialects(files);
  const outcomes: Record<string, FileOutcome> = {};
  for (const file of files)
    outcomes[file.path] = file.failure
      ? { status: "failed", ...file.failure }
      : { status: "pending" };
  useImportFlowStore.setState({
    mode: "batch",
    phase: plan.ask.length ? "asking" : "running",
    folder,
    files,
    choices: plan.known,
    ask: plan.ask,
    outcomes,
    stopRequested: false,
  });
  if (!plan.ask.length) await runBatch();
}

export async function importDraft(path: string) {
  const files = await analyzeFiles([path], readTextFile);
  const [file] = files;
  if (file.failure) {
    logWarn("import.failed", file.failure.reason, { format: file.format ?? "unknown" });
    toast.error(
      file.failure.message ?? i18next.t(`importFlow.reason.${file.failure.reason}`),
    );
    return;
  }
  const plan = planDialects(files);
  if (plan.ask.length) {
    useImportFlowStore.setState({
      mode: "draft",
      phase: "asking",
      folder: null,
      files,
      choices: plan.known,
      ask: plan.ask,
      outcomes: {},
      stopRequested: false,
    });
    return;
  }
  finishDraft(file, plan.known[file.path].dbType);
}

function finishDraft(file: BatchFile, dbType: DbType) {
  if (!file.format) return;
  const parsed = parseSource(file.format, file.content, dbType);
  replaceWithImport(parsed.tables, parsed.relations, parsed.enums, dbType, file.name);
  const skipped = parsed.attempted - parsed.tables.length;
  logInfo("import.done", "Import done", {
    format: file.format,
    tables: parsed.tables.length,
    relations: parsed.relations.length,
    skipped,
    issues: parsed.issues.length,
    fromHome: true,
  });
  showImportSummary({
    tables: parsed.tables.length,
    relations: parsed.relations.length,
    skipped,
    issues: parsed.issues,
  });
}

export function answerDialects(answers: Readonly<Record<string, DbType>>) {
  const state = useImportFlowStore.getState();
  const choices = { ...state.choices };
  for (const [path, dbType] of Object.entries(answers))
    choices[path] = { dbType, source: "asked" };
  if (state.mode === "draft") {
    const [file] = state.files;
    resetImportFlow();
    finishDraft(file, choices[file.path].dbType);
    return;
  }
  useImportFlowStore.setState({ choices, ask: [], phase: "running" });
  runBatch().catch((e: unknown) => logError("import.failed", e, { format: "batch" }));
}

export async function runBatch() {
  const { files, folder, choices, outcomes } = useImportFlowStore.getState();
  if (!folder) return;
  const queue = files.filter((f) => outcomes[f.path]?.status === "pending");
  const ended = await runImportBatch(
    queue,
    folder,
    choices,
    {
      create: (dir, name, content) =>
        invoke<string>("create_schema_file", { dir, name, content }).catch(
          (e: unknown) => {
            throw e === "folder_refused" ? new FolderRefusedError() : e;
          },
        ),
      remember: addRecentFile,
    },
    {
      onOutcome: (path, outcome) => {
        useImportFlowStore.setState((s) => ({
          outcomes: { ...s.outcomes, [path]: outcome },
        }));
        if (outcome.status !== "failed") return;
        if (outcome.reason === "write_failed")
          logError("import.batch.write_failed", outcome.reason);
        else
          logWarn("import.batch.file_failed", outcome.reason, { reason: outcome.reason });
      },
      shouldStop: () => useImportFlowStore.getState().stopRequested,
    },
  );
  const final = { ...useImportFlowStore.getState().outcomes };
  if (ended === "stopped") {
    for (const file of files)
      if (final[file.path]?.status === "pending")
        final[file.path] = { status: "skipped" };
  }
  useImportFlowStore.setState({ outcomes: final, phase: ended });
  const counts: Record<string, number> = {};
  for (const outcome of Object.values(final)) {
    const key =
      outcome.status === "done" && (outcome.issues.length || outcome.layoutFailed)
        ? "warned"
        : outcome.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  logInfo("import.batch.done", "Batch import ended", { ended, ...counts });
}

export async function chooseAnotherFolder() {
  const folder = await open({ directory: true, multiple: false });
  if (typeof folder !== "string") return;
  useImportFlowStore.setState({ folder, phase: "running" });
  await runBatch();
}

export function stopBatch() {
  useImportFlowStore.setState({ stopRequested: true });
}

export function revealImported() {
  const done = Object.values(useImportFlowStore.getState().outcomes).find(
    (o) => o.status === "done",
  );
  if (done?.status !== "done") return;
  revealItemInDir(done.savedAs).catch((e: unknown) => {
    logError("home.reveal.failed", e);
    toast.error(i18next.t("home.revealFailed", { error: String(e) }));
  });
}
