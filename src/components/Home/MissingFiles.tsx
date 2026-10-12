import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import type { HomeEntry } from "../../utils/homeList";

interface MissingFilesProps {
  entries: HomeEntry[];
  onLocate: (path: string) => void;
  onRemove: (paths: string[]) => void;
}

export function MissingFiles({ entries, onLocate, onRemove }: MissingFilesProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className="mt-7 border-t border-border-light pt-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="-ml-1.5 inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-tertiary transition-colors hover:text-secondary"
      >
        <WarningCircle size={15} />
        <span>{t("home.missing", { count: entries.length })}</span>
        <span aria-hidden="true">·</span>
        <span className="font-medium text-secondary underline underline-offset-2">
          {open ? t("home.missingHide") : t("home.missingShow")}
        </span>
      </button>
      {open && (
        <div
          id={listId}
          className="mt-2.5 max-w-[720px] overflow-hidden rounded-[10px] border border-border bg-surface"
        >
          <p className="border-b border-border bg-surface-canvas px-3.5 py-2.5 text-[12px] text-tertiary">
            {t("home.missingExplain")}
          </p>
          <ul>
            {entries.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center gap-3 border-b border-border-light px-3.5 py-2.5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-secondary">
                    {entry.name}
                  </span>
                  <span
                    className="truncate font-mono text-[11px] text-tertiary"
                    title={entry.path}
                  >
                    {entry.path}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onLocate(entry.path)}
                  className="h-7 shrink-0 rounded-md border border-border bg-surface px-2.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted"
                >
                  {t("home.locate")}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove([entry.path])}
                  className="h-7 shrink-0 rounded-md px-2.5 text-[12px] font-medium text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
                >
                  {t("home.remove")}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-2.5 py-2">
            <button
              type="button"
              onClick={() => onRemove(entries.map((e) => e.path))}
              className="h-7 rounded-md px-2.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted"
            >
              {t("home.removeAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
