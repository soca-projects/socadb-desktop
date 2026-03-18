import { useState, useEffect, useRef } from "react";
import {
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  PlusIcon as Plus,
  TrashIcon as Trash,
  KeyIcon as Key,
  LinkIcon as Link,
  DotsSixVerticalIcon as DragHandle,
  HashIcon as Hash,
  CaretUpDownIcon as CaretUpDown,
  DotsThreeVerticalIcon as DotsThreeVertical,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { genId } from "../../utils/id";
import { createTable } from "../../utils/schemaActions";
import { TOOLBAR_HEIGHT } from "../../utils/layout";
import type { ColumnType, Table, Column } from "../../types/schema";
import { COLUMN_TYPES_BY_DB } from "../../types/schema";
import { getColorVariants, normalizeTableColor, PRESET_COLORS } from "../../utils/tableColors";

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

const BADGE_INACTIVE =
  "bg-transparent text-stone-400 border-transparent hover:bg-stone-100 hover:text-stone-500";
const BADGE_ACTIVE = {
  default: "bg-accent/10 text-accent border-accent/20",
  amber: "bg-badge-primary-bg text-badge-primary border-badge-primary-border",
  blue: "bg-badge-unique-bg text-badge-unique border-badge-unique-border",
} as const;

function ConstraintBadge({
  label,
  active,
  disabled,
  onClick,
  variant = "default",
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "amber" | "blue";
}) {
  const colorClass = active ? BADGE_ACTIVE[variant] : BADGE_INACTIVE;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center rounded-[4px] border px-[5px] py-[1px] font-mono text-[11px] font-medium leading-tight transition-all ${colorClass} ${disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"}`}
    >
      {label}
    </button>
  );
}

function ColumnRow({ col, tableId }: { col: Column; tableId: string }) {
  const updateColumn = useSchemaStore((s) => s.updateColumn);
  const deleteColumn = useSchemaStore((s) => s.deleteColumn);
  const columnTypes = useSchemaStore((s) => COLUMN_TYPES_BY_DB[s.schema.dbType]);

  return (
    <div className="group relative">
      <div className="absolute left-0 top-0 flex h-full w-5 items-center justify-center opacity-0 transition-opacity group-hover:opacity-40">
        <DragHandle size={10} className="text-stone-400" />
      </div>

      <div className="rounded-md py-1.5 pl-5 pr-2 transition-colors group-hover:bg-surface/80">
        <div className="flex items-center gap-1.5">
          <div className="flex w-3.5 shrink-0 items-center justify-center">
            {col.isPrimaryKey ? (
              <Key size={13} weight="fill" className="text-amber-500" />
            ) : col.isForeignKey ? (
              <Link size={13} weight="bold" className="text-blue-500" />
            ) : (
              <Hash size={13} className="text-stone-300" />
            )}
          </div>

          <input
            type="text"
            spellCheck={false}
            autoCorrect="off"
            defaultValue={col.name}
            onBlur={(e) => updateColumn(tableId, col.id, { name: e.target.value })}
            onKeyDown={blurOnEnter}
            className="min-w-0 flex-1 truncate bg-transparent font-mono text-[13px] font-medium text-stone-800 outline-none placeholder:text-stone-300 focus:text-stone-900"
            placeholder="column_name"
          />

          <div className="relative shrink-0">
            <select
              value={col.type}
              onChange={(e) =>
                updateColumn(tableId, col.id, {
                  type: e.target.value as ColumnType,
                })
              }
              className="cursor-pointer appearance-none rounded-[4px] border border-border bg-surface py-0.5 pl-1.5 pr-4 font-mono text-[11px] text-stone-500 outline-none transition-all hover:border-stone-300 hover:text-stone-700 focus:border-accent/40"
            >
              {columnTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <CaretUpDown
              size={8}
              weight="bold"
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-stone-400"
            />
          </div>

          <button
            onClick={() => deleteColumn(tableId, col.id)}
            className="shrink-0 rounded-[4px] p-[3px] text-stone-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            aria-label="Delete column"
          >
            <Trash size={13} />
          </button>
        </div>

        <div className="mt-1 flex items-center gap-1 pl-5">
          <ConstraintBadge
            label="PRIMARY"
            active={col.isPrimaryKey}
            variant="amber"
            onClick={() =>
              updateColumn(tableId, col.id, {
                isPrimaryKey: !col.isPrimaryKey,
                ...(!col.isPrimaryKey ? { isUnique: true, isNullable: false } : {}),
              })
            }
          />
          <ConstraintBadge
            label="NULL"
            active={col.isNullable}
            disabled={col.isPrimaryKey}
            onClick={() =>
              updateColumn(tableId, col.id, {
                isNullable: !col.isNullable,
              })
            }
          />
          <ConstraintBadge
            label="UNIQUE"
            active={col.isUnique}
            disabled={col.isPrimaryKey}
            variant="blue"
            onClick={() => updateColumn(tableId, col.id, { isUnique: !col.isUnique })}
          />
        </div>
      </div>
    </div>
  );
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
        className="rounded-[4px] p-1 text-stone-500 transition-all hover:bg-surface-muted hover:text-stone-700"
        aria-label="Table options"
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
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-700 transition-colors hover:bg-surface-muted"
          >
            <PencilSimple size={14} />
            Rename
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onAddColumn();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-700 transition-colors hover:bg-surface-muted"
          >
            <Plus size={14} />
            Add column
          </button>
          <div className="mx-2 my-1 h-px bg-border-light" />
          <button
            role="menuitem"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash size={14} />
            Delete table
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
}: {
  table: Table;
  isOpen: boolean;
  isRenaming: boolean;
  onToggle: () => void;
  onRename: () => void;
  onRenameEnd: () => void;
}) {
  const updateTable = useSchemaStore((s) => s.updateTable);
  const deleteTable = useSchemaStore((s) => s.deleteTable);
  const addColumn = useSchemaStore((s) => s.addColumn);
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
    addColumn(table.id, {
      id: genId(),
      name: `column_${table.columns.length + 1}`,
      type: "varchar",
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: false,
      isAutoIncrement: false,
      defaultValue: null,
    });
  };

  return (
    <div className={isOpen ? "bg-surface-muted/50" : ""}>
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors hover:bg-surface-muted"
        onClick={onToggle}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center">
            {isOpen ? (
              <CaretDown size={12} weight="bold" className="text-stone-400" />
            ) : (
              <CaretRight size={12} weight="bold" className="text-stone-400" />
            )}
          </div>
          {table.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: getColorVariants(table.color).dot }}
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
              className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-stone-800 outline-none focus:text-accent"
            />
          ) : (
            <span className="truncate font-mono text-sm font-medium text-stone-800">
              {table.name}
            </span>
          )}
          <span className="shrink-0 rounded-full bg-stone-200/60 px-1.5 py-[1px] font-mono text-[11px] text-stone-400">
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
                const v = getColorVariants(preset);
                const isActive = !!table.color && normalizeTableColor(table.color) === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => updateTable(table.id, { color: preset })}
                    className="h-4 w-4 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: isActive ? v.dot : v.bg,
                      borderColor: "transparent",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = v.dot; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isActive ? v.dot : v.bg; }}
                    aria-label={`Color ${preset}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="mx-1 space-y-px">
            {table.columns.map((col) => (
              <ColumnRow key={col.id} col={col} tableId={table.id} />
            ))}
          </div>

          <div className="mx-3 mt-1">
            <button
              onClick={handleAddColumn}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-stone-300 py-2 text-xs font-medium text-stone-500 transition-all hover:border-accent/40 hover:bg-accent/[0.03] hover:text-accent"
            >
              <Plus size={12} weight="bold" />
              Add column
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
  const tables = useSchemaStore((s) => s.schema.tables);
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);

  const handleAddTable = () => {
    const newId = createTable();
    onOpenTable(newId);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed left-0 z-20 flex w-[280px] flex-col border-r border-border bg-surface-sidebar"
      style={{
        top: TOOLBAR_HEIGHT,
        height: `calc(100vh - ${TOOLBAR_HEIGHT}px)`,
      }}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
          Tables
        </span>
        <span className="rounded-full bg-stone-200/60 px-1.5 py-[1px] font-mono text-[11px] text-stone-400">
          {tables.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tables.length === 0 ? (
          <div className="flex animate-fade-in flex-col items-center px-4 pt-10 text-center">
            <p className="text-[13px] leading-relaxed text-stone-500">
              No tables yet. Create one to start building your schema.
            </p>
            <div className="mt-5 space-y-1 self-stretch text-left text-[12px] text-stone-400">
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-stone-500">1.</span>
                <span>Add tables and define columns</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-stone-500">2.</span>
                <span>Drag between columns to create relations</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
                <span className="shrink-0 font-mono text-[11px] text-stone-500">3.</span>
                <span>
                  Save as <span className="font-mono text-stone-500">.soca</span> and
                  export
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
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          onClick={handleAddTable}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] font-medium text-stone-700 transition-all hover:border-stone-300 hover:bg-surface-muted hover:text-stone-900 active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" />
          New Table
        </button>
      </div>
    </div>
  );
}
