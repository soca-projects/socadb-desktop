import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretUpDownIcon as CaretUpDown,
  CaretUpIcon as CaretUp,
  ChatTextIcon as ChatText,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { changeColumnType } from "../../utils/columnActions";
import {
  HINTED_TYPES,
  MYSQL_INT_TYPES,
  typeLabel,
  typeMenuGroups,
} from "../../utils/columnTypes";
import { enumNameError } from "../../utils/enumHelpers";
import { findEnumById } from "../../utils/schemaQueries";
import { LENGTH_TYPES, MYSQL_NUMERIC_TYPES, PRECISION_TYPES } from "../../types/schema";
import type { Column, SchemaEnum, Table } from "../../types/schema";
import { NoteBubble } from "../NoteBubble/NoteBubble";
import { PickMenu, type PickGroup } from "../PickMenu/PickMenu";
import { ColumnIcon } from "./ColumnIcon";
import { ConstraintBadge } from "./ConstraintBadge";
import { DefaultField } from "./DefaultField";
import { EnumValues } from "./EnumValues";

const FIELD =
  "h-[26px] w-full rounded-[4px] border bg-surface px-[7px] font-mono text-[11.5px] text-secondary outline-none";
const FIELD_OK = "border-border hover:border-border-hover focus:border-accent/45";
const FIELD_BAD = "border-red-500";
const LABEL = "text-[11.5px] text-tertiary";

interface ColumnEditorProps {
  table: Table;
  column: Column;
  selectName: boolean;
  noteOpen: boolean;
  onNoteOpenChange: (open: boolean) => void;
  onGoToColumn: (tableId: string, columnId: string) => void;
  onClose: () => void;
}

export function ColumnEditor({
  table,
  column,
  selectName,
  noteOpen,
  onNoteOpenChange,
  onGoToColumn,
  onClose,
}: ColumnEditorProps) {
  const { t } = useTranslation();
  const dbType = useSchemaStore((s) => s.schema.dbType);
  const enums = useSchemaStore((s) => s.schema.enums);
  const columnEnum = useSchemaStore((s) =>
    column.type === "enum" && column.enumId
      ? findEnumById(s.schema, column.enumId)
      : undefined,
  );
  const tables = useSchemaStore((s) => s.schema.tables);
  const updateColumn = useSchemaStore((s) => s.updateColumn);
  const deleteColumn = useSchemaStore((s) => s.deleteColumn);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [noteButton, setNoteButton] = useState<HTMLButtonElement | null>(null);
  const [badgeRow, setBadgeRow] = useState<HTMLDivElement | null>(null);
  const [typeAnchor, setTypeAnchor] = useState<HTMLElement | null>(null);
  const [focusValues, setFocusValues] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const closeTypeMenu = useCallback(() => setTypeAnchor(null), []);
  const closeNote = useCallback(() => onNoteOpenChange(false), [onNoteOpenChange]);

  const update = (updates: Partial<Column>) => updateColumn(table.id, column.id, updates);
  const autoAllowed = dbType === "mysql" && MYSQL_INT_TYPES.has(column.type);
  const unsignedAllowed = dbType === "mysql" && MYSQL_NUMERIC_TYPES.has(column.type);

  useEffect(() => {
    card?.scrollIntoView({ block: "nearest" });
  }, [card]);

  useEffect(() => {
    if (!selectName) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [selectName]);

  const getTypeGroups = useCallback(
    (query: string): PickGroup[] =>
      typeMenuGroups(dbType, query, enums ?? [], column.enumId).map((g) => ({
        label: t(`typeMenu.groups.${g.id}`),
        items: g.items.map((item) => ({
          value: item.value,
          label: item.label,
          hint: item.enumValues
            ? item.enumValues.join(", ")
            : item.type && HINTED_TYPES.has(item.type)
              ? t(`typeMenu.hints.${item.type}`)
              : undefined,
        })),
      })),
    [dbType, enums, column.enumId, t],
  );

  return (
    <div
      ref={setCard}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        // Blur first: a field's edit is saved on blur, and unmounting skips it.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onClose();
      }}
      className="relative mx-1 mb-1 mt-0.5 rounded border border-border bg-surface pb-2.5 pl-2.5 pr-2 pt-1.5 shadow-card"
    >
      <div className="flex items-center gap-1.5">
        <ColumnIcon column={column} />
        <input
          key={column.name}
          ref={nameRef}
          type="text"
          spellCheck={false}
          autoCorrect="off"
          defaultValue={column.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (!name) e.target.value = column.name;
            else if (name !== column.name) update({ name });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={t("sidePanel.columnName")}
          className="-ml-1 h-[26px] min-w-0 flex-1 rounded-[4px] border border-transparent bg-transparent px-1 font-mono text-[13px] font-medium text-primary outline-none hover:border-border focus:border-accent/45"
        />
        <button
          type="button"
          onClick={(e) => setTypeAnchor(typeAnchor ? null : e.currentTarget)}
          aria-haspopup="listbox"
          aria-expanded={!!typeAnchor}
          aria-label={t("sidePanel.columnType")}
          className={`inline-flex h-[22px] max-w-[132px] shrink-0 items-center gap-1 rounded-[4px] border bg-surface pl-1.5 pr-[5px] font-mono text-[11px] transition-colors ${
            typeAnchor
              ? "border-accent/45 text-secondary"
              : "border-border text-tertiary hover:border-border-hover hover:text-secondary"
          }`}
        >
          <span className="truncate">{typeLabel(column)}</span>
          <CaretUpDown size={8} weight="bold" className="shrink-0" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("sidePanel.closeColumn")}
          title={t("sidePanel.closeColumn")}
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[4px] text-tertiary hover:bg-surface-muted hover:text-secondary"
        >
          <CaretUp size={12} weight="bold" />
        </button>
      </div>

      <div ref={setBadgeRow} className="ml-5 mt-1.5 flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <ConstraintBadge
            label="PRIMARY"
            active={column.isPrimaryKey}
            variant="amber"
            onClick={() =>
              update({
                isPrimaryKey: !column.isPrimaryKey,
                ...(!column.isPrimaryKey ? { isUnique: true, isNullable: false } : {}),
              })
            }
          />
          <ConstraintBadge
            label="NULL"
            active={column.isNullable}
            disabled={column.isPrimaryKey}
            onClick={() => update({ isNullable: !column.isNullable })}
          />
          <ConstraintBadge
            label="UNIQUE"
            active={column.isUnique}
            disabled={column.isPrimaryKey}
            variant="blue"
            onClick={() => update({ isUnique: !column.isUnique })}
          />
          {autoAllowed && (
            <ConstraintBadge
              label="AUTO"
              active={column.isAutoIncrement}
              onClick={() =>
                update({
                  isAutoIncrement: !column.isAutoIncrement,
                  ...(!column.isAutoIncrement ? { defaultValue: null } : {}),
                })
              }
            />
          )}
          {unsignedAllowed && (
            <ConstraintBadge
              label="UNSIGNED"
              active={!!column.unsigned}
              onClick={() => update({ unsigned: !column.unsigned })}
            />
          )}
        </div>
        <button
          ref={setNoteButton}
          type="button"
          onClick={() => onNoteOpenChange(!noteOpen)}
          aria-label={column.note ? t("sidePanel.editNote") : t("sidePanel.addNote")}
          title={column.note || t("sidePanel.addNote")}
          className={`-my-px grid h-5 w-5 place-items-center rounded-[4px] hover:bg-surface-muted ${
            noteOpen ? "bg-surface-muted" : ""
          } ${column.note ? "text-accent" : "text-tertiary hover:text-secondary"}`}
        >
          <ChatText size={13} />
        </button>
      </div>

      {noteOpen && noteButton && badgeRow && card && (
        <NoteBubble
          name={column.name}
          note={column.note ?? ""}
          placeholder={t("sidePanel.noteColumnPlaceholder")}
          anchor={noteButton}
          below={badgeRow}
          frame={card}
          onCommit={(note) => update({ note: note || undefined })}
          onClose={closeNote}
        />
      )}

      <div className="ml-5 mt-2.5 grid grid-cols-[50px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5">
        {columnEnum && (
          <EnumDetails
            columnEnum={columnEnum}
            column={column}
            tables={tables}
            canName={dbType === "postgresql"}
            autoFocus={focusValues}
            onGoToColumn={onGoToColumn}
          />
        )}
        {LENGTH_TYPES.has(column.type) && (
          <>
            <label htmlFor={`${fieldId}-length`} className={LABEL}>
              {t("sidePanel.length")}
            </label>
            <Parens>
              <NumberField
                id={`${fieldId}-length`}
                value={column.length}
                placeholder="255"
                title={t("sidePanel.lengthHint")}
                onCommit={(length) => update({ length: length || undefined })}
              />
            </Parens>
          </>
        )}
        {PRECISION_TYPES.has(column.type) && (
          <>
            <label htmlFor={`${fieldId}-precision`} className={LABEL}>
              {t("sidePanel.precision")}
            </label>
            <Parens>
              <NumberField
                id={`${fieldId}-precision`}
                value={column.precision}
                placeholder="10"
                title={t("sidePanel.precisionHint")}
                onCommit={(precision) => update({ precision: precision || undefined })}
              />
              <span>,</span>
              <NumberField
                value={column.scale}
                placeholder="0"
                title={t("sidePanel.scaleHint")}
                label={t("sidePanel.scale")}
                invalid={
                  column.precision !== undefined &&
                  column.scale !== undefined &&
                  column.scale > column.precision
                }
                onCommit={(scale) => update({ scale })}
              />
            </Parens>
          </>
        )}
        <label htmlFor={`${fieldId}-default`} className={LABEL}>
          {t("sidePanel.default")}
        </label>
        <DefaultField
          id={`${fieldId}-default`}
          tableId={table.id}
          column={column}
          dbType={dbType}
          choices={
            columnEnum
              ? columnEnum.values
              : column.type === "boolean"
                ? ["true", "false"]
                : null
          }
        />
      </div>

      <div className="ml-5 mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={() => deleteColumn(table.id, column.id)}
          className="rounded-[4px] px-1 text-[11.5px] text-tertiary transition-colors hover:text-red-600 dark:hover:text-red-400"
        >
          {t("sidePanel.deleteColumn")}
        </button>
      </div>

      {typeAnchor && (
        <PickMenu
          anchor={typeAnchor}
          value={column.type}
          getGroups={getTypeGroups}
          searchPlaceholder={t("typeMenu.searchTypes")}
          emptyLabel={(query) => t("typeMenu.nothingMatches", { query })}
          onPick={(value) => {
            if (value === "enum" && column.type !== "enum") setFocusValues(true);
            changeColumnType(table.id, column.id, value);
          }}
          onClose={closeTypeMenu}
        />
      )}
    </div>
  );
}

function EnumDetails({
  columnEnum,
  column,
  tables,
  canName,
  autoFocus,
  onGoToColumn,
}: {
  columnEnum: SchemaEnum;
  column: Column;
  tables: Table[];
  canName: boolean;
  autoFocus: boolean;
  onGoToColumn: (tableId: string, columnId: string) => void;
}) {
  const { t } = useTranslation();
  const updateEnum = useSchemaStore((s) => s.updateEnum);
  const others = tables.flatMap((tb) =>
    tb.columns
      .filter((c) => c.enumId === columnEnum.id && c.id !== column.id)
      .map((c) => ({ table: tb, column: c })),
  );

  return (
    <>
      <span className={`${LABEL} self-start pt-1`}>{t("sidePanel.values")}</span>
      <EnumValues
        values={columnEnum.values}
        autoFocus={autoFocus}
        onChange={(values) => updateEnum(columnEnum.id, { values })}
      />
      {canName && <EnumNameField columnEnum={columnEnum} />}
      {others.length > 0 && (
        <>
          <span />
          <p className="text-[11.5px] leading-[1.45] text-tertiary">
            {t("sidePanel.sameEnumAsPrefix")}{" "}
            {others.map((o, i) => (
              <span key={o.column.id}>
                {i > 0 && ", "}
                <button
                  type="button"
                  onClick={() => onGoToColumn(o.table.id, o.column.id)}
                  className="font-mono text-secondary underline decoration-border-hover underline-offset-2 hover:text-accent"
                >
                  {o.table.name}.{o.column.name}
                </button>
              </span>
            ))}
            {t("sidePanel.sameEnumAsSuffix", { count: others.length })}
          </p>
        </>
      )}
    </>
  );
}

function EnumNameField({ columnEnum }: { columnEnum: SchemaEnum }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const updateEnum = useSchemaStore((s) => s.updateEnum);
  const [draft, setDraft] = useState(columnEnum.name);
  const [synced, setSynced] = useState(columnEnum.name);
  if (synced !== columnEnum.name) {
    setSynced(columnEnum.name);
    setDraft(columnEnum.name);
  }
  const id = useId();
  const error = enumNameError(schema, columnEnum.id, draft);
  const message =
    error === "empty"
      ? t("sidePanel.enumNameEmpty")
      : error === "table"
        ? t("sidePanel.enumNameTable", { name: draft.trim() })
        : error === "enum"
          ? t("sidePanel.enumNameEnum", { name: draft.trim() })
          : null;

  return (
    <>
      <label htmlFor={id} className={`${LABEL} self-start pt-1`}>
        {t("sidePanel.enumName")}
      </label>
      <div>
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const name = draft.trim();
            if (error) setDraft(columnEnum.name);
            else if (name !== columnEnum.name) updateEnum(columnEnum.id, { name });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          spellCheck={false}
          title={t("sidePanel.enumNameHint")}
          aria-invalid={!!error}
          className={`${FIELD} ${error ? FIELD_BAD : FIELD_OK}`}
        />
        {message && (
          <p className="mt-[3px] text-[11px] leading-[1.4] text-red-600 dark:text-red-400">
            {message}
          </p>
        )}
      </div>
    </>
  );
}

function Parens({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1 font-mono text-[12px] text-tertiary">
      <span>(</span>
      {children}
      <span>)</span>
    </div>
  );
}

function NumberField({
  id,
  value,
  placeholder,
  title,
  label,
  invalid,
  onCommit,
}: {
  id?: string;
  value: number | undefined;
  placeholder: string;
  title: string;
  label?: string;
  invalid?: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value?.toString() ?? "");
  }

  return (
    <input
      id={id}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
      onBlur={() => {
        const next = draft === "" ? undefined : Number(draft);
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder={placeholder}
      title={title}
      inputMode="numeric"
      aria-invalid={invalid}
      className={`${FIELD} w-[52px] text-center ${invalid ? FIELD_BAD : FIELD_OK}`}
    />
  );
}
