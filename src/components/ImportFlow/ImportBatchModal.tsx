import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  CheckCircleIcon as CheckCircle,
  CircleDashedIcon as CircleDashed,
  CircleNotchIcon as CircleNotch,
  MinusCircleIcon as MinusCircle,
  WarningIcon as Warning,
  XCircleIcon as XCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import { Modal } from "../Modal/Modal";
import { resetImportFlow, useImportFlowStore } from "../../stores/importFlowStore";
import { chooseAnotherFolder, revealImported, stopBatch } from "../../utils/homeImport";
import { fileNameOf, orderOutcomes, summarizeBatch } from "../../utils/importFiles";
import type { FileOutcome } from "../../utils/importFiles";
import { describeImportIssue } from "../../utils/importReport";
import { REVEAL_LABEL_KEY } from "../../utils/platform";

const DB_LABEL = { mysql: "MySQL", postgresql: "PostgreSQL" };

const SECONDARY =
  "rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-muted";
const PRIMARY =
  "rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]";

function StatusIcon({ outcome }: { outcome: FileOutcome | undefined }) {
  const { t } = useTranslation();
  const props = { size: 16, className: "shrink-0" };
  switch (outcome?.status) {
    case "done":
      return outcome.issues.length || outcome.layoutFailed ? (
        <Warning
          {...props}
          className="shrink-0 text-amber-700 dark:text-amber-400"
          alt={t("importFlow.warned")}
        />
      ) : (
        <CheckCircle
          {...props}
          className="shrink-0 text-emerald-600 dark:text-emerald-400"
          alt={t("importFlow.imported")}
        />
      );
    case "failed":
      return (
        <XCircle
          {...props}
          className="shrink-0 text-red-600 dark:text-red-400"
          alt={t("importFlow.failed")}
        />
      );
    case "running":
      return (
        <CircleNotch
          {...props}
          className="shrink-0 animate-spin text-accent"
          alt={t("importFlow.running")}
        />
      );
    case "skipped":
      return (
        <MinusCircle
          {...props}
          className="shrink-0 text-tertiary"
          alt={t("importFlow.skipped")}
        />
      );
    default:
      return (
        <CircleDashed
          {...props}
          className="shrink-0 text-muted"
          alt={t("importFlow.pending")}
        />
      );
  }
}

function OutcomeRow({
  path,
  outcome,
  first,
}: {
  path: string;
  outcome: FileOutcome | undefined;
  first: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const running = outcome?.status === "running";

  useEffect(() => {
    if (running) ref.current?.scrollIntoView({ block: "nearest" });
  }, [running]);

  const quiet = !outcome || outcome.status === "pending" || outcome.status === "skipped";
  let meta = t("importFlow.pending");
  let warnings: string[] = [];
  if (outcome?.status === "running") meta = t("importFlow.running");
  if (outcome?.status === "skipped") meta = t("importFlow.skipped");
  if (outcome?.status === "failed")
    meta = outcome.message ?? t(`importFlow.reason.${outcome.reason}`);
  if (outcome?.status === "done") {
    const dbType = DB_LABEL[outcome.dbType];
    meta = [
      outcome.source === "batch"
        ? t("importFlow.fromBatch", { dbType })
        : outcome.source === "asked"
          ? t("importFlow.chosen", { dbType })
          : dbType,
      t("importFlow.tables", { count: outcome.tables }),
      ...(outcome.relations
        ? [t("importFlow.relations", { count: outcome.relations })]
        : []),
    ].join(" · ");
    warnings = [
      ...outcome.issues.map(describeImportIssue),
      ...(outcome.layoutFailed ? [t("importFlow.layoutFailed")] : []),
    ];
  }

  return (
    <li
      ref={ref}
      className={`flex items-start gap-2.5 px-3 py-2.5 ${first ? "" : "border-t border-border-light"}`}
    >
      <span className="flex h-[18px] items-center">
        <StatusIcon outcome={outcome} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span
            className={`font-mono text-[13px] ${quiet ? "text-tertiary" : "text-primary"}`}
          >
            {fileNameOf(path)}
          </span>
          {outcome?.status === "done" && (
            <>
              <span aria-hidden className="text-[12px] text-tertiary">
                →
              </span>
              <span className="font-mono text-[13px] text-primary">
                {fileNameOf(outcome.savedAs)}
              </span>
            </>
          )}
        </div>
        <span
          className={`text-[12px] leading-snug ${
            outcome?.status === "failed"
              ? "text-red-600 dark:text-red-400"
              : "text-tertiary"
          }`}
        >
          {meta}
        </span>
        {warnings.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1 self-start py-0.5 text-[12px] font-medium text-amber-700 dark:text-amber-400"
            >
              {t("importFlow.warnings", { count: warnings.length })}
              {open ? (
                <CaretDown size={12} aria-hidden />
              ) : (
                <CaretRight size={12} aria-hidden />
              )}
            </button>
            {open && (
              <ul className="mt-0.5 flex list-disc flex-col gap-1 rounded-md bg-surface-muted py-2 pl-6 pr-2.5 text-[12px] leading-snug text-secondary">
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function ImportBatchModal() {
  const { t } = useTranslation();
  const phase = useImportFlowStore((s) => s.phase);
  const files = useImportFlowStore((s) => s.files);
  const outcomes = useImportFlowStore((s) => s.outcomes);
  const folder = fileNameOf(useImportFlowStore((s) => s.folder) ?? "");
  const summary = summarizeBatch(files, outcomes);
  const running = phase === "running";
  const finished = phase === "done" || phase === "stopped";
  const paths = files.map((f) => f.path);
  const rows = finished ? orderOutcomes(paths, outcomes) : paths;

  const title = finished
    ? t(phase === "done" ? "importFlow.doneTitle" : "importFlow.stoppedTitle")
    : t("importFlow.batchTitle", { count: files.length });
  const subtitle = finished
    ? [
        t("importFlow.created", { count: summary.created, folder }),
        ...(summary.notImported
          ? [t("importFlow.notImported", { count: summary.notImported })]
          : []),
      ].join(" · ")
    : t("importFlow.runningSubtitle", {
        folder,
        done: summary.processed,
        total: summary.importable,
      });

  return (
    <Modal
      onClose={resetImportFlow}
      dismissible={!running}
      maxWidth="max-w-[560px]"
      zIndex={60}
      ariaLabelledBy="import-batch-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col gap-4 p-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 id="import-batch-title" className="text-base font-semibold text-primary">
              {title}
            </h2>
            <p className="mt-1 text-[13px] text-tertiary">{subtitle}</p>
          </div>
          {!running && (
            <button
              type="button"
              onClick={resetImportFlow}
              className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
              aria-label={t("importFlow.close")}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {running && (
          <div
            role="progressbar"
            aria-label={t("importFlow.progress")}
            aria-valuemin={0}
            aria-valuemax={summary.importable}
            aria-valuenow={summary.processed}
            className="h-1 shrink-0 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${summary.importable ? (summary.processed / summary.importable) * 100 : 0}%`,
              }}
            />
          </div>
        )}

        {phase === "folder_refused" && (
          <div
            role="alert"
            className="flex shrink-0 items-start gap-2.5 rounded-lg border border-badge-primary-border bg-badge-primary-bg px-3 py-2.5 text-[13px]"
          >
            <Warning
              size={16}
              className="mt-0.5 shrink-0 text-badge-primary"
              aria-hidden
            />
            <div className="flex flex-col gap-0.5">
              <strong className="font-medium text-primary">
                {t("importFlow.folderRefused")}
              </strong>
              <span className="text-secondary">
                {t("importFlow.folderRefusedHint", { count: summary.pending })}
              </span>
            </div>
          </div>
        )}

        <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {rows.map((path, i) => (
            <OutcomeRow key={path} path={path} outcome={outcomes[path]} first={i === 0} />
          ))}
        </ul>

        <div className="flex shrink-0 justify-end gap-2">
          {running && (
            <button type="button" onClick={stopBatch} className={SECONDARY}>
              {t("importFlow.stop")}
            </button>
          )}
          {phase === "folder_refused" && (
            <>
              <button type="button" onClick={resetImportFlow} className={SECONDARY}>
                {t("importFlow.close")}
              </button>
              <button
                type="button"
                onClick={() => void chooseAnotherFolder()}
                className={PRIMARY}
              >
                {t("importFlow.chooseFolder")}
              </button>
            </>
          )}
          {finished && (
            <>
              {summary.created > 0 && (
                <button type="button" onClick={revealImported} className={SECONDARY}>
                  {t(REVEAL_LABEL_KEY)}
                </button>
              )}
              <button type="button" onClick={resetImportFlow} className={PRIMARY}>
                {t("importFlow.close")}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
