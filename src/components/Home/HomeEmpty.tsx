import { useTranslation } from "react-i18next";
import {
  DownloadSimpleIcon as DownloadSimple,
  FolderOpenIcon as FolderOpen,
  PlusIcon as Plus,
  SquaresFourIcon as SquaresFour,
} from "@phosphor-icons/react";

interface HomeEmptyProps {
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
}

const ACTION =
  "flex flex-col items-start gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-border-hover hover:bg-surface-muted";

export function HomeEmpty({ onNew, onOpen, onImport }: HomeEmptyProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto mt-12 flex max-w-[640px] flex-col items-center gap-2.5 text-center">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-surface-muted text-tertiary">
        <SquaresFour size={24} />
      </span>
      <h2 className="mt-2 text-[18px] font-bold text-primary">{t("home.empty.title")}</h2>
      <p className="max-w-[460px] text-[13.5px] leading-normal text-tertiary">
        {t("home.empty.description")}
      </p>
      <div className="mt-4 grid w-full grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <button type="button" onClick={onNew} className={ACTION}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent-hover">
            <Plus size={16} />
          </span>
          <span className="text-[13.5px] font-medium text-primary">{t("home.new")}</span>
          <span className="text-[12px] leading-snug text-tertiary">
            {t("home.empty.newHint")}
          </span>
        </button>
        <button type="button" onClick={onOpen} className={ACTION}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-secondary">
            <FolderOpen size={16} />
          </span>
          <span className="text-[13.5px] font-medium text-primary">
            {t("home.empty.open")}
          </span>
          <span className="text-[12px] leading-snug text-tertiary">
            {t("home.empty.openHint")}
          </span>
        </button>
        <button type="button" onClick={onImport} className={ACTION}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-secondary">
            <DownloadSimple size={16} />
          </span>
          <span className="text-[13.5px] font-medium text-primary">
            {t("home.empty.import")}
          </span>
          <span className="text-[12px] leading-snug text-tertiary">
            {t("home.empty.importHint")}
          </span>
        </button>
      </div>
    </div>
  );
}
