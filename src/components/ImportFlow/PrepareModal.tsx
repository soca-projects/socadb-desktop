import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderIcon as Folder,
  WarningIcon as Warning,
  XIcon as X,
} from "@phosphor-icons/react";
import { Modal } from "../Modal/Modal";
import { DialectRows } from "./DialectRows";
import { resetImportFlow, useImportFlowStore } from "../../stores/importFlowStore";
import { answerDialects, changeFolder } from "../../utils/homeImport";
import { displayFolder, fileNameOf } from "../../utils/importFiles";
import { IS_MAC } from "../../utils/platform";
import type { DbType } from "../../types/schema";

const SECTION = "text-[12px] font-medium uppercase tracking-wide text-tertiary";

export function PrepareModal() {
  const { t } = useTranslation();
  const ask = useImportFlowStore((s) => s.ask);
  const files = useImportFlowStore((s) => s.files);
  const folder = useImportFlowStore((s) => s.folder) ?? "";
  const home = useImportFlowStore((s) => s.home);
  const sourceFolder = useImportFlowStore((s) => s.sourceFolder);
  const writable = useImportFlowStore((s) => s.folderWritable);
  const [answers, setAnswers] = useState<Record<string, DbType>>({});
  const dbOf = (path: string): DbType => answers[path] ?? "postgresql";
  const others = files.filter((f) => !f.failure).length - ask.length;
  const where = displayFolder(folder, home);

  return (
    <Modal
      onClose={resetImportFlow}
      maxWidth="max-w-[520px]"
      zIndex={60}
      ariaLabelledBy="prepare-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col gap-5 p-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 id="prepare-title" className="text-base font-semibold text-primary">
              {t("importFlow.prepareTitle", { count: files.length })}
            </h2>
            <p className="mt-1 text-[13px] text-tertiary">
              {t("importFlow.prepareHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={resetImportFlow}
            className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
            aria-label={t("importFlow.close")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <span id="prepare-folder" className={SECTION}>
            {t("importFlow.saveIn")}
          </span>
          <div
            aria-labelledby="prepare-folder"
            className="flex items-center gap-2.5 rounded-lg border border-border py-2.5 pl-3 pr-2.5"
          >
            <Folder size={18} className="shrink-0 text-tertiary" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-primary">
                {fileNameOf(folder)}
              </span>
              <span className="truncate text-[12px] text-tertiary">
                {folder === sourceFolder
                  ? `${where} · ${t("importFlow.sourceFolder")}`
                  : where}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void changeFolder()}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted"
            >
              {t("importFlow.change")}
            </button>
          </div>
        </div>

        {writable === false && (
          <div
            role="alert"
            className="-mt-2 flex shrink-0 items-start gap-2.5 rounded-lg border border-badge-primary-border bg-badge-primary-bg px-3 py-2.5 text-[13px]"
          >
            <Warning
              size={16}
              className="mt-0.5 shrink-0 text-badge-primary"
              aria-hidden
            />
            <div className="flex flex-col gap-0.5">
              <strong className="font-medium text-primary">
                {t("importFlow.folderNotWritable")}
              </strong>
              <span className="text-secondary">
                {t(
                  IS_MAC
                    ? "importFlow.folderNotWritableHintMac"
                    : "importFlow.folderNotWritableHint",
                )}
              </span>
            </div>
          </div>
        )}

        {ask.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <span className={SECTION}>{t("importFlow.databaseSection")}</span>
            <p className="text-[13px] text-tertiary">
              {t("importFlow.prepareAsk", { count: ask.length })}
            </p>
            <DialectRows
              paths={ask}
              dbOf={dbOf}
              onPick={(path, dbType) => setAnswers((a) => ({ ...a, [path]: dbType }))}
              onPickAll={(dbType) =>
                setAnswers(Object.fromEntries(ask.map((path) => [path, dbType])))
              }
            />
            {others > 0 && (
              <p className="shrink-0 text-[12px] text-tertiary">
                {t("importFlow.dialectOthers", { count: others })}
              </p>
            )}
          </div>
        )}

        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={resetImportFlow}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-colors hover:bg-surface-muted"
          >
            {t("importFlow.cancel")}
          </button>
          <button
            type="button"
            disabled={writable === false}
            onClick={() =>
              answerDialects(Object.fromEntries(ask.map((path) => [path, dbOf(path)])))
            }
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent disabled:active:scale-100"
          >
            {t("importFlow.import")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
