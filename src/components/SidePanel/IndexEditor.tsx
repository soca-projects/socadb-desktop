import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CaretUpIcon as CaretUp } from "@phosphor-icons/react";
import {
  derivedIndexName,
  indexColumnNames,
  toggleIndexColumn,
} from "../../utils/indexHelpers";
import type { Table, TableIndex } from "../../types/schema";
import { ConstraintBadge } from "./ConstraintBadge";

interface IndexEditorProps {
  table: Table;
  index: TableIndex;
  onChange: (updates: Partial<Omit<TableIndex, "id">>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function IndexEditor({
  table,
  index,
  onChange,
  onDelete,
  onClose,
}: IndexEditorProps) {
  const { t } = useTranslation();
  const nameId = useId();
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [name, setName] = useState(index.name ?? "");
  const [synced, setSynced] = useState(index.name);
  if (synced !== index.name) {
    setSynced(index.name);
    setName(index.name ?? "");
  }
  const label = indexColumnNames(table, index).join(", ");

  useEffect(() => {
    card?.scrollIntoView({ block: "nearest" });
  }, [card]);

  return (
    <div
      ref={setCard}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onClose();
      }}
      className="relative mx-1 mb-1 mt-0.5 rounded border border-border bg-surface pb-2.5 pl-2.5 pr-2 pt-1.5 shadow-card"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`min-w-0 flex-1 truncate py-1 ${
            label ? "font-mono text-[12.5px] text-primary" : "text-[12.5px] text-tertiary"
          }`}
        >
          {label || t("sidePanel.newIndex")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("sidePanel.closeIndex")}
          title={t("sidePanel.closeIndex")}
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[4px] text-tertiary hover:bg-surface-muted hover:text-secondary"
        >
          <CaretUp size={12} weight="bold" />
        </button>
      </div>

      <p className="my-1.5 text-[11.5px] text-tertiary">
        {t("sidePanel.pickColumnsHint")}
      </p>
      <div className="flex flex-wrap gap-1">
        {table.columns.map((column) => {
          const order = index.columnIds.indexOf(column.id);
          return (
            <button
              key={column.id}
              type="button"
              aria-pressed={order >= 0}
              onClick={() =>
                onChange({ columnIds: toggleIndexColumn(index.columnIds, column.id) })
              }
              className={`inline-flex items-center gap-1 rounded-[4px] border px-[5px] py-px font-mono text-[11px] leading-[1.4] transition-colors ${
                order >= 0
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border text-tertiary hover:border-border-hover hover:text-secondary"
              }`}
            >
              {order >= 0 && <b className="font-semibold">{order + 1}</b>}
              {column.name}
            </button>
          );
        })}
      </div>

      {/* A one-column unique index says the same as the column's UNIQUE flag,
          so the toggle shows from two columns, or to switch an imported one off. */}
      {(index.columnIds.length > 1 || index.unique) && (
        <div className="mt-2" title={t("sidePanel.uniqueIndexHint")}>
          <ConstraintBadge
            label="UNIQUE"
            active={index.unique}
            variant="blue"
            onClick={() => onChange({ unique: !index.unique })}
          />
        </div>
      )}

      <div className="mt-2.5 grid grid-cols-[50px_minmax(0,1fr)] items-center gap-x-2">
        <label htmlFor={nameId} className="text-[11.5px] text-tertiary">
          {t("sidePanel.indexName")}
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim() || undefined;
            if (next !== index.name) onChange({ name: next });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder={derivedIndexName(table, index)}
          title={t("sidePanel.indexNameHint")}
          spellCheck={false}
          className="h-[26px] w-full rounded-[4px] border border-border bg-surface px-[7px] font-mono text-[11.5px] text-secondary outline-none placeholder:text-tertiary hover:border-border-hover focus:border-accent/45"
        />
      </div>

      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="rounded-[4px] px-1 text-[11.5px] text-tertiary transition-colors hover:text-red-600 dark:hover:text-red-400"
        >
          {t("sidePanel.deleteIndex")}
        </button>
      </div>
    </div>
  );
}
