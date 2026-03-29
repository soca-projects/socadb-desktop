import { useTranslation } from "react-i18next";
import {
  TableIcon as Table,
  PlusIcon as Plus,
  ArrowLeftIcon as ArrowLeft,
} from "@phosphor-icons/react";

interface EmptyCanvasProps {
  onAddTable: () => void;
  isSidePanelOpen: boolean;
}

export function EmptyCanvas({ onAddTable, isSidePanelOpen }: EmptyCanvasProps) {
  const { t } = useTranslation();

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto flex max-w-[320px] flex-col items-center text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/[0.07] animate-fade-in"
          style={{ animationDelay: "0.05s" }}
        >
          <Table size={22} className="text-accent" />
        </div>

        <h3
          className="mt-4 text-[15px] font-semibold text-primary animate-fade-in"
          style={{ animationDelay: "0.12s" }}
        >
          {t("emptyCanvas.heading")}
        </h3>
        <p
          className="mt-1.5 text-[13px] leading-relaxed text-tertiary animate-fade-in"
          style={{ animationDelay: "0.18s" }}
        >
          {t("emptyCanvas.description")}
        </p>

        <button
          onClick={onAddTable}
          className="mt-5 flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98] animate-fade-in"
          style={{ animationDelay: "0.25s" }}
        >
          <Plus size={15} weight="bold" />
          {t("emptyCanvas.createFirst")}
        </button>

        <div
          className="mt-6 flex items-center gap-5 text-[12px] text-tertiary animate-fade-in"
          style={{ animationDelay: "0.35s" }}
        >
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-tertiary shadow-soft">
              {"\u2318"}N
            </kbd>
            {t("emptyCanvas.newSchema")}
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-tertiary shadow-soft">
              {"\u2318"}O
            </kbd>
            {t("emptyCanvas.openFile")}
          </span>
        </div>

        {!isSidePanelOpen && (
          <p
            className="mt-4 flex items-center gap-1 text-[12px] text-tertiary animate-fade-in"
            style={{ animationDelay: "0.4s" }}
          >
            <ArrowLeft size={10} />
            {t("emptyCanvas.openSidePanel")}
          </p>
        )}
      </div>
    </div>
  );
}
