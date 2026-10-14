import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  PlusIcon as Plus,
  TrashIcon as Trash,
  DotsThreeVerticalIcon as DotsThreeVertical,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useThemeStore } from "../../stores/themeStore";
import { genId } from "../../utils/id";
import { createTable } from "../../utils/schemaActions";
import type { Table } from "../../types/schema";
import {
  getColorVariants,
  normalizeTableColor,
  PRESET_COLORS,
} from "../../utils/tableColors";
import { ColumnEditor } from "./ColumnEditor";
import { ColumnRow } from "./ColumnRow";

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

export interface ColumnFocus {
  tableId: string;
  columnId: string;
  note: boolean;
  selectName: boolean;
}

function TableMenu({
  onRename,
  onAddColumn,
  onDelete,
}: {
  onRename: () => void;
  onAddColumn: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 160;
      const menuHeight = 140;
      const top = Math.min(rect.top, window.innerHeight - menuHeight);
      const left = Math.min(rect.right + 4, window.innerWidth - menuWidth);
      setMenuPos({ top, left });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="rounded-[4px] p-1 text-tertiary transition-all hover:bg-surface-muted hover:text-secondary"
        aria-label={t("sidePanel.tableOptions")}
      >
        <DotsThreeVertical size={14} weight="bold" />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
          className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-float"
          role="menu"
        >
          <button
            role="menuitem"
            onClick={() => {
              onRename();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-secondary transition-colors hover:bg-surface-muted"
          >
            <PencilSimple size={14} />
            {t("sidePanel.rename")}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onAddColumn();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-secondary transition-colors hover:bg-surface-muted"
          >
            <Plus size={14} />
            {t("sidePanel.addColumn")}
          </button>
          <div className="mx-2 my-1 h-px bg-border-light" />
          <button
            role="menuitem"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <Trash size={14} />
            {t("sidePanel.deleteTable")}
          </button>
        </div>
      )}
    </>
  );
}

function TableItem({
  table,
  isOpen,
  isRenaming,
  onToggle,
  onRename,
  onRenameEnd,
  editing,
  onEdit,
  onGoToColumn,
}: {
  table: Table;
  isOpen: boolean;
  isRenaming: boolean;
  onToggle: () => void;
  onRename: () => void;
  onRenameEnd: () => void;
  editing: ColumnFocus | null;
  onEdit: (focus: ColumnFocus | null) => void;
  onGoToColumn: (tableId: string, columnId: string) => void;
}) {
  const { t } = useTranslation();
  const updateTable = useSchemaStore((s) => s.updateTable);
  const deleteTable = useSchemaStore((s) => s.deleteTable);
  const addColumn = useSchemaStore((s) => s.addColumn);
  const isDark = useThemeStore((s) => s.theme === "dark");
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    onEdit({ tableId: table.id, columnId: id, note: false, selectName: true });
  };
  const edit = (columnId: string, note: boolean) =>
    onEdit({ tableId: table.id, columnId, note, selectName: false });

  return (
    <div className={isOpen ? "bg-surface-muted/50" : ""}>
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors hover:bg-surface-muted"
        onClick={onToggle}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            {isOpen ? (
              <CaretDown size={12} weight="bold" className="text-tertiary" />
            ) : (
              <CaretRight size={12} weight="bold" className="text-tertiary" />
            )}
          </div>
          {table.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: getColorVariants(table.color, isDark).dot }}
            />
          )}
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
              onKeyDown={blurOnEnter}
              className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-primary outline-none focus:text-accent"
            />
          ) : (
            <span className="truncate font-mono text-sm font-medium text-primary">
              {table.name}
            </span>
          )}
          <span className="shrink-0 rounded-full border border-border-light bg-surface-muted px-1.5 py-[1px] font-mono text-[11px] text-tertiary">
            {table.columns.length}
          </span>
        </div>
        <TableMenu
          onRename={onRename}
          onAddColumn={handleAddColumn}
          onDelete={() => deleteTable(table.id)}
        />
      </div>

      {isOpen && (
        <div className="animate-fade-in-subtle pb-2">
          <div className="mx-3 mb-2 mt-1">
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((preset) => {
                const v = getColorVariants(preset, isDark);
                const isActive =
                  !!table.color && normalizeTableColor(table.color) === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => updateTable(table.id, { color: preset })}
                    className="h-4 w-4 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: isActive ? v.dot : v.bg,
                      borderColor: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = v.dot;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isActive ? v.dot : v.bg;
                    }}
                    aria-label={t("sidePanel.color", { color: preset })}
                  />
                );
              })}
            </div>
          </div>

          <div>
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
          </div>

          <div className="mx-3 mt-1">
            <button
              onClick={handleAddColumn}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs font-medium text-tertiary transition-all hover:border-accent/40 hover:bg-accent/[0.03] hover:text-accent"
            >
              <Plus size={12} weight="bold" />
              {t("sidePanel.addColumn")}
            </button>
          </div>
        </div>
      )}

      <div className="mx-3 h-px bg-border-light" />
    </div>
  );
}

interface SidePanelProps {
  isOpen: boolean;
  openTableId: string | null;
  onOpenTable: (id: string | null) => void;
}

export function SidePanel({ isOpen, openTableId, onOpenTable }: SidePanelProps) {
  const { t } = useTranslation();
  const tables = useSchemaStore((s) => s.schema.tables);
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ColumnFocus | null>(null);
  // The canvas opens tables too: whatever opens another table closes the
  // column editor, except a jump to a column of that table.
  const [shownTableId, setShownTableId] = useState(openTableId);
  if (shownTableId !== openTableId) {
    setShownTableId(openTableId);
    if (editing && editing.tableId !== openTableId) setEditing(null);
  }

  const handleAddTable = () => {
    const newId = createTable();
    onOpenTable(newId);
  };

  if (!isOpen) return null;

  return (
    <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border bg-surface-sidebar">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary">
          {t("sidePanel.tables")}
        </span>
        <span className="rounded-full border border-border-light bg-surface-muted px-1.5 py-[1px] font-mono text-[11px] text-tertiary">
          {tables.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tables.length === 0 ? (
          <div className="flex animate-fade-in flex-col items-center px-4 pt-10 text-center">
            <p className="text-[13px] leading-relaxed text-tertiary">
              {t("sidePanel.emptyState")}
            </p>
            <div className="mt-5 space-y-1 self-stretch text-left text-[12px] text-tertiary">
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-tertiary">1.</span>
                <span>{t("sidePanel.step1")}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-tertiary">2.</span>
                <span>{t("sidePanel.step2")}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-tertiary">3.</span>
                <span>
                  {t("sidePanel.step3Save")}{" "}
                  <span className="font-mono text-tertiary">.soca</span>{" "}
                  {t("sidePanel.step3Export")}
                </span>
              </div>
            </div>
          </div>
        ) : (
          tables.map((table) => (
            <TableItem
              key={table.id}
              table={table}
              isOpen={openTableId === table.id}
              isRenaming={renamingTableId === table.id}
              onToggle={() => onOpenTable(openTableId === table.id ? null : table.id)}
              onRename={() => {
                onOpenTable(table.id);
                setRenamingTableId(table.id);
              }}
              onRenameEnd={() => setRenamingTableId(null)}
              editing={editing?.tableId === table.id ? editing : null}
              onEdit={setEditing}
              onGoToColumn={(tableId, columnId) => {
                setEditing({ tableId, columnId, note: false, selectName: false });
                onOpenTable(tableId);
              }}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          onClick={handleAddTable}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] font-medium text-secondary transition-all hover:border-border-hover hover:bg-surface-muted hover:text-primary active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" />
          {t("sidePanel.newTable")}
        </button>
      </div>
    </div>
  );
}
