import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { CaretUpDownIcon as CaretUpDown } from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { defaultKindOf, defaultSql } from "../../utils/columnDefaults";
import { TIME_TYPES, timeSuggestions } from "../../utils/columnTypes";
import { PickMenu, type PickGroup } from "../PickMenu/PickMenu";
import type { Column, DbType } from "../../types/schema";

const SEARCH_FROM = 8;
const FIELD =
  "h-[26px] w-full rounded-[4px] border border-border bg-surface px-[7px] font-mono text-[11.5px] text-secondary outline-none hover:border-border-hover focus:border-accent/45";

interface DefaultFieldProps {
  id: string;
  tableId: string;
  column: Column;
  dbType: DbType;
  choices: string[] | null;
}

export function DefaultField({
  id,
  tableId,
  column,
  dbType,
  choices,
}: DefaultFieldProps) {
  const { t } = useTranslation();
  if (column.isAutoIncrement) {
    return (
      <input
        id={id}
        disabled
        placeholder={t("sidePanel.setByAuto")}
        className={`${FIELD} opacity-50 placeholder:font-sans`}
      />
    );
  }
  if (choices)
    return <DefaultPicker id={id} tableId={tableId} column={column} choices={choices} />;
  return <DefaultInput id={id} tableId={tableId} column={column} dbType={dbType} />;
}

function DefaultPicker({
  id,
  tableId,
  column,
  choices,
}: {
  id: string;
  tableId: string;
  column: Column;
  choices: string[];
}) {
  const { t } = useTranslation();
  const updateColumn = useSchemaStore((s) => s.updateColumn);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const getGroups = useCallback(
    (query: string): PickGroup[] => {
      const q = query.trim().toLowerCase();
      const items = choices
        .filter((v) => !q || v.toLowerCase().includes(q))
        .map((v) => ({ value: v, label: v }));
      if (q) return [{ items }];
      return [
        {
          items: [{ value: "", label: t("sidePanel.noDefault"), muted: true }, ...items],
        },
      ];
    },
    [choices, t],
  );

  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`${FIELD} flex items-center justify-between text-left ${anchor ? "border-accent/45" : ""}`}
      >
        <span
          className={`truncate ${column.defaultValue ? "" : "font-sans text-tertiary"}`}
        >
          {column.defaultValue ?? t("sidePanel.noDefault")}
        </span>
        <CaretUpDown size={8} weight="bold" className="shrink-0 text-tertiary" />
      </button>
      {anchor && (
        <PickMenu
          anchor={anchor}
          value={column.defaultValue ?? ""}
          getGroups={getGroups}
          searchPlaceholder={
            choices.length >= SEARCH_FROM ? t("typeMenu.searchValues") : undefined
          }
          emptyLabel={(query) => t("typeMenu.nothingMatches", { query })}
          width={180}
          onPick={(v) =>
            updateColumn(
              tableId,
              column.id,
              v ? { defaultValue: v, defaultKind: "value" } : { defaultValue: null },
            )
          }
          onClose={close}
        />
      )}
    </>
  );
}

function DefaultInput({
  id,
  tableId,
  column,
  dbType,
}: {
  id: string;
  tableId: string;
  column: Column;
  dbType: DbType;
}) {
  const { t } = useTranslation();
  const updateColumn = useSchemaStore((s) => s.updateColumn);
  const [draft, setDraft] = useState(column.defaultValue ?? "");
  // Undo, redo and the agent change the default under the field.
  const [synced, setSynced] = useState(column.defaultValue);
  if (synced !== column.defaultValue) {
    setSynced(column.defaultValue);
    setDraft(column.defaultValue ?? "");
  }
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const closeSuggestions = useCallback(() => setSuggesting(false), []);
  const getGroups = useCallback(
    (query: string): PickGroup[] => {
      const q = query.trim().toLowerCase();
      const items = timeSuggestions(column.type, dbType)
        .filter((s) => !q || s.value.toLowerCase().includes(q))
        .map((s) => ({
          value: s.value,
          label: s.value,
          hint: t(`typeMenu.time.${s.hintKey}`),
        }));
      return [{ label: t("typeMenu.suggestions"), items }];
    },
    [column.type, dbType, t],
  );

  const value = draft.trim();
  // A kind someone picked with the chip belongs to that text: typing new text
  // goes back to guessing it.
  const edited = (value || null) !== column.defaultValue;
  const preview: Column = {
    ...column,
    defaultValue: value || null,
    defaultKind: edited ? undefined : column.defaultKind,
  };
  const kind = defaultKindOf(preview);
  const commit = () => {
    if (!edited) return;
    updateColumn(tableId, column.id, {
      defaultValue: value || null,
      defaultKind: undefined,
    });
  };

  return (
    <div className="relative">
      <input
        id={id}
        ref={setField}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSuggesting(true);
        }}
        onFocus={() => setSuggesting(true)}
        onBlur={() => {
          setSuggesting(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={t("sidePanel.noDefault")}
        spellCheck={false}
        autoComplete="off"
        className={`${FIELD} pr-[38px] placeholder:font-sans placeholder:text-tertiary`}
      />
      {value && (
        // Mousedown keeps the focus in the field, so the draft and the new kind
        // land in one update, one undo step.
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            updateColumn(tableId, column.id, {
              defaultValue: value,
              defaultKind: kind === "expression" ? "value" : "expression",
            })
          }
          title={t(
            kind === "expression"
              ? "sidePanel.defaultAsExpression"
              : "sidePanel.defaultAsValue",
            {
              sql: defaultSql(preview),
            },
          )}
          className={`absolute right-1 top-1 h-[18px] rounded-[3px] border px-[5px] font-mono text-[10.5px] leading-4 ${
            kind === "expression"
              ? "border-accent/30 bg-accent/[0.08] text-accent"
              : "border-border bg-surface-muted text-tertiary hover:border-border-hover hover:text-primary"
          }`}
        >
          {kind === "expression" ? "ƒx" : "abc"}
        </button>
      )}
      {suggesting && TIME_TYPES.has(column.type) && field && (
        <PickMenu
          anchor={field}
          value={value}
          query={draft}
          getGroups={getGroups}
          width={250}
          onPick={(v) =>
            updateColumn(tableId, column.id, {
              defaultValue: v,
              defaultKind: "expression",
            })
          }
          onClose={closeSuggestions}
        />
      )}
    </div>
  );
}
