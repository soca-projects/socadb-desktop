import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  ChatTextIcon as ChatText,
  DotsThreeVerticalIcon as DotsThreeVertical,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useThemeStore } from "../../stores/themeStore";
import { genId } from "../../utils/id";
import { getColorVariants } from "../../utils/tableColors";
import type { Table } from "../../types/schema";
import { ActionMenu } from "../ActionMenu/ActionMenu";
import { NoteBubble } from "../NoteBubble/NoteBubble";
import { ColorPalette } from "./ColorPalette";
import { ColumnEditor } from "./ColumnEditor";
import { ColumnRow } from "./ColumnRow";
import { IndexesTab } from "./IndexesTab";

export interface ColumnFocus {
  tableId: string;
  columnId: string;
  note: boolean;
  selectName: boolean;
}

type Tab = "columns" | "indexes";

interface TableItemProps {
  table: Table;
  isOpen: boolean;
  isRenaming: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRename: () => void;
  onRenameEnd: () => void;
  editing: ColumnFocus | null;
  onEdit: (focus: ColumnFocus | null) => void;
  onGoToColumn: (tableId: string, columnId: string) => void;
}

export function TableItem({
  table,
  isOpen,
  isRenaming,
  onToggle,
  onOpen,
  onRename,
  onRenameEnd,
  editing,
  onEdit,
  onGoToColumn,
}: TableItemProps) {
  const { t } = useTranslation();
  const updateTable = useSchemaStore((s) => s.updateTable);
  const deleteTable = useSchemaStore((s) => s.deleteTable);
  const addColumn = useSchemaStore((s) => s.addColumn);
  const isDark = useThemeStore((s) => s.theme === "dark");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<HTMLDivElement | null>(null);
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const [noteButton, setNoteButton] = useState<HTMLButtonElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [palette, setPalette] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("columns");
  const closeNote = useCallback(() => setNoteOpen(false), []);
  const closePalette = useCallback(() => setPalette(false), []);
  // The canvas closes tables without going through onToggle, so the reset
  // watches isOpen instead of living in the click handler.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setNoteOpen(false);
      setTab("columns");
    }
  }

  useEffect(() => {
    if (isRenaming && isOpen) {
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    }
  }, [isRenaming, isOpen]);

  const handleAddColumn = () => {
    const id = genId();
    addColumn(table.id, {
      id,
      name: `column_${table.columns.length + 1}`,
      type: "varchar",
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: false,
      isAutoIncrement: false,
      defaultValue: null,
    });
    setTab("columns");
    onOpen();
    onEdit({ tableId: table.id, columnId: id, note: false, selectName: true });
  };
  const edit = (columnId: string, note: boolean) =>
    onEdit({ tableId: table.id, columnId, note, selectName: false });
  const showTab = (next: Tab) => {
    setTab(next);
    onEdit(null);
  };
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "columns", label: t("sidePanel.columnsTab"), count: table.columns.length },
    {
      id: "indexes",
      label: t("sidePanel.indexesTab"),
      count: table.indexes?.length ?? 0,
    },
  ];

  return (
    <div ref={setItem} className={`relative ${isOpen ? "bg-surface-muted/50" : ""}`}>
      <div
        ref={setHeader}
        className="flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-muted"
        onClick={onToggle}
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isOpen ? (
            <CaretDown size={12} weight="bold" className="text-tertiary" />
          ) : (
            <CaretRight size={12} weight="bold" className="text-tertiary" />
          )}
        </div>
        <button
          type="button"
          onMouseDown={(e) => {
            // Otherwise the palette's outside-click closes it and this click reopens it.
            if (palette) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setPalette(!palette);
          }}
          aria-label={t("sidePanel.tableColor")}
          aria-expanded={palette}
          className="-mx-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full hover:bg-surface-muted hover:shadow-[0_0_0_1px_var(--color-border-hover)]"
        >
          <span
            className="h-[9px] w-[9px] rounded-full"
            style={{
              backgroundColor: table.color
                ? getColorVariants(table.color, isDark).dot
                : "var(--color-fg-muted)",
            }}
          />
        </button>
        {isRenaming ? (
          <input
            ref={nameInputRef}
            type="text"
            spellCheck={false}
            autoCorrect="off"
            defaultValue={table.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              updateTable(table.id, { name: e.target.value });
              onRenameEnd();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-primary outline-none focus:text-accent"
          />
        ) : (
          <span
            className={`truncate font-mono text-sm font-medium text-primary ${
              isOpen ? "marker" : ""
            }`}
          >
            {table.name}
          </span>
        )}
        <span className="shrink-0 rounded-full border border-border-light bg-surface-muted px-1.5 py-[1px] font-mono text-[11px] text-tertiary">
          {table.columns.length}
        </span>
        <span className="flex-1" />
        {isOpen && (
          <button
            ref={setNoteButton}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setNoteOpen(!noteOpen);
            }}
            aria-label={table.note ? t("sidePanel.editNote") : t("sidePanel.addNote")}
            title={table.note || t("sidePanel.addNote")}
            className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[4px] hover:bg-surface-muted ${
              noteOpen ? "bg-surface-muted" : ""
            } ${table.note ? "text-accent" : "text-tertiary hover:text-secondary"}`}
          >
            <ChatText size={13} />
          </button>
        )}
        <button
          type="button"
          onMouseDown={(e) => {
            if (menu) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { x: r.left, y: r.bottom + 4 });
          }}
          aria-label={t("sidePanel.tableOptions")}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          className="shrink-0 rounded-[4px] p-1 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
        >
          <DotsThreeVertical size={14} weight="bold" />
        </button>
      </div>

      {menu && (
        <ActionMenu
          x={menu.x}
          y={menu.y}
          label={t("sidePanel.tableOptions")}
          onClose={() => setMenu(null)}
          items={[
            { label: t("sidePanel.rename"), onSelect: onRename },
            { label: t("sidePanel.addColumn"), onSelect: handleAddColumn },
            {
              label: table.note ? t("sidePanel.editNote") : t("sidePanel.addNote"),
              onSelect: () => {
                onOpen();
                setNoteOpen(true);
              },
            },
            {
              label: t("sidePanel.deleteTable"),
              danger: true,
              separatorBefore: true,
              onSelect: () => deleteTable(table.id),
            },
          ]}
        />
      )}

      {palette && (
        <ColorPalette
          color={table.color}
          onPick={(color) => updateTable(table.id, { color })}
          onClose={closePalette}
        />
      )}

      {isOpen && noteOpen && noteButton && header && item && (
        <NoteBubble
          name={table.name}
          note={table.note ?? ""}
          placeholder={t("sidePanel.noteTablePlaceholder")}
          anchor={noteButton}
          below={header}
          frame={item}
          onCommit={(note) => updateTable(table.id, { note: note || undefined })}
          onClose={closeNote}
        />
      )}

      {isOpen && (
        <div className="animate-fade-in-subtle pb-1">
          <div
            role="tablist"
            className="mx-3 mb-1 mt-0.5 flex gap-4 border-b border-border-light"
          >
            {tabs.map(({ id, label, count }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => showTab(id)}
                className={`flex items-center gap-1.5 pb-[7px] pt-1.5 text-[12.5px] font-medium transition-colors ${
                  tab === id
                    ? "text-primary shadow-[inset_0_-1.5px_0_var(--color-fg)]"
                    : "text-tertiary hover:text-secondary"
                }`}
              >
                {label}
                <span className="rounded-full border border-border-light bg-surface-muted px-1.5 font-mono text-[11px] font-normal text-tertiary">
                  {count}
                </span>
              </button>
            ))}
          </div>

          {tab === "columns" ? (
            <>
              {table.columns.map((col) =>
                editing?.columnId === col.id ? (
                  <ColumnEditor
                    key={col.id}
                    table={table}
                    column={col}
                    selectName={editing.selectName}
                    noteOpen={editing.note}
                    onNoteOpenChange={(note) => edit(col.id, note)}
                    onGoToColumn={onGoToColumn}
                    onClose={() => onEdit(null)}
                  />
                ) : (
                  <ColumnRow
                    key={col.id}
                    table={table}
                    column={col}
                    onEdit={() => edit(col.id, false)}
                    onEditNote={() => edit(col.id, true)}
                  />
                ),
              )}
              <button
                type="button"
                onClick={handleAddColumn}
                className="mx-1 mb-1 mt-0.5 flex h-[30px] w-[calc(100%-8px)] items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-tertiary transition-colors hover:bg-surface-muted hover:text-accent"
              >
                <Plus size={12} weight="bold" />
                {t("sidePanel.addColumn")}
              </button>
            </>
          ) : (
            <IndexesTab table={table} />
          )}
        </div>
      )}

      <div className="mx-3 h-px bg-border-light" />
    </div>
  );
}
