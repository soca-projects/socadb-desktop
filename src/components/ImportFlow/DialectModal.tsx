import { useState } from "react";
import { useTranslation } from "react-i18next";
import { XIcon as X } from "@phosphor-icons/react";
import { Modal } from "../Modal/Modal";
import { DialectRows } from "./DialectRows";
import { resetImportFlow, useImportFlowStore } from "../../stores/importFlowStore";
import { answerDialects } from "../../utils/homeImport";
import type { DbType } from "../../types/schema";

export function DialectModal() {
  const { t } = useTranslation();
  const ask = useImportFlowStore((s) => s.ask);
  const [answers, setAnswers] = useState<Record<string, DbType>>({});
  const dbOf = (path: string): DbType => answers[path] ?? "postgresql";

  return (
    <Modal
      onClose={resetImportFlow}
      maxWidth="max-w-[520px]"
      zIndex={60}
      ariaLabelledBy="dialect-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col gap-4 p-6">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 id="dialect-title" className="text-base font-semibold text-primary">
              {t("importFlow.dialectTitle", { count: ask.length })}
            </h2>
            <p className="mt-1 text-[13px] text-tertiary">
              {t("importFlow.dialectHint", { count: ask.length })}
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

        <DialectRows
          paths={ask}
          dbOf={dbOf}
          onPick={(path, dbType) => setAnswers((a) => ({ ...a, [path]: dbType }))}
          onPickAll={(dbType) =>
            setAnswers(Object.fromEntries(ask.map((path) => [path, dbType])))
          }
        />

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
            onClick={() =>
              answerDialects(Object.fromEntries(ask.map((path) => [path, dbOf(path)])))
            }
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
          >
            {t("importFlow.import")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
