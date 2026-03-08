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
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { genId } from "../../utils/id";
import { TOOLBAR_HEIGHT } from "../Canvas/Canvas";
import type { ColumnType, Table, Column } from "../../types/schema";

const COLUMN_TYPES: ColumnType[] = [
  "uuid",
  "serial",
  "int",
  "bigint",
  "float",
  "decimal",
  "varchar",
  "text",
  "char",
  "boolean",
  "date",
  "time",
  "timestamp",
  "datetime",
  "json",
  "jsonb",
  "blob",
];

const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

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
  const inactive =
    "bg-transparent text-gray-400 border-transparent hover:bg-gray-100 hover:text-gray-500";
  const activeStyles = {
    default: "bg-accent/10 text-accent border-accent/20",
    amber: "bg-amber-50 text-amber-600 border-amber-200/60",
    blue: "bg-blue-50 text-blue-600 border-blue-200/60",
  };
  const colorClass = active ? activeStyles[variant] : inactive;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`inline-flex items-center rounded-[4px] border px-[5px] py-[1px] font-mono text-[11px] font-medium leading-tight transition-all ${colorClass} ${disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"}`}
    >
      {label}
    </button>
  );
}

function ColumnRow({ col, tableId }: { col: Column; tableId: string }) {
  const updateColumn = useSchemaStore((s) => s.updateColumn);
  const deleteColumn = useSchemaStore((s) => s.deleteColumn);

  return (
    <div className="group relative">
      <div className="absolute left-0 top-0 flex h-full w-5 items-center justify-center opacity-0 transition-opacity group-hover:opacity-40">
        <DragHandle size={10} className="text-gray-400" />
      </div>

      <div className="rounded-md py-1.5 pl-5 pr-2 transition-colors group-hover:bg-white/80">
        <div className="flex items-center gap-1.5">
          <div className="flex w-3.5 shrink-0 items-center justify-center">
            {col.isPrimaryKey ? (
              <Key size={13} weight="fill" className="text-amber-500" />
            ) : col.isForeignKey ? (
              <Link size={13} weight="bold" className="text-blue-500" />
            ) : (
              <Hash size={13} className="text-gray-300" />
            )}
          </div>

          <input
            type="text"
            spellCheck={false}
            autoCorrect="off"
            defaultValue={col.name}
            onBlur={(e) => updateColumn(tableId, col.id, { name: e.target.value })}
            onKeyDown={blurOnEnter}
            className="min-w-0 flex-1 truncate bg-transparent font-mono text-[13px] font-medium text-gray-800 outline-none placeholder:text-gray-300 focus:text-gray-900"
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
              className="cursor-pointer appearance-none rounded-[4px] border border-border bg-white py-0.5 pl-1.5 pr-4 font-mono text-[11px] text-gray-500 outline-none transition-all hover:border-gray-300 hover:text-gray-700 focus:border-accent/40"
            >
              {COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <CaretUpDown
              size={8}
              weight="bold"
              className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>

          <button
            onClick={() => deleteColumn(tableId, col.id)}
            className="shrink-0 rounded-[4px] p-[3px] text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
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
            variant={col.isUnique ? "blue" : "default"}
            onClick={() => updateColumn(tableId, col.id, { isUnique: !col.isUnique })}
          />
        </div>
      </div>
    </div>
  );
}

function TableMenu({
  onAddColumn,
  onDelete,
}: {
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
      setMenuPos({ top: rect.top, left: rect.right + 4 });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="rounded-[4px] p-1 text-gray-500 transition-all hover:bg-surface-muted hover:text-gray-700"
      >
        <DotsThreeVertical size={14} weight="bold" />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
          className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-white py-1 shadow-float"
        >
          <button
            onClick={() => {
              onAddColumn();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-gray-700 transition-colors hover:bg-surface-muted"
          >
            <Plus size={14} />
            Add column
          </button>
          <div className="mx-2 my-1 h-px bg-border-light" />
          <button
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-red-600 transition-colors hover:bg-red-50"
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
  onToggle,
}: {
  table: Table;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const updateTable = useSchemaStore((s) => s.updateTable);
  const deleteTable = useSchemaStore((s) => s.deleteTable);
  const addColumn = useSchemaStore((s) => s.addColumn);

  const handleAddColumn = () => {
    addColumn(table.id, {
      id: genId(),
      name: `column_${table.columns.length + 1}`,
      type: "varchar",
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: false,
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
              <CaretDown size={12} weight="bold" className="text-gray-400" />
            ) : (
              <CaretRight size={12} weight="bold" className="text-gray-400" />
            )}
          </div>
          {isOpen ? (
            <input
              type="text"
              spellCheck={false}
              autoCorrect="off"
              defaultValue={table.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => updateTable(table.id, { name: e.target.value })}
              onKeyDown={blurOnEnter}
              className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-gray-800 outline-none focus:text-accent"
            />
          ) : (
            <span className="font-mono text-sm font-medium text-gray-800">
              {table.name}
            </span>
          )}
          <span className="shrink-0 rounded-full bg-gray-200/60 px-1.5 py-[1px] font-mono text-[11px] text-gray-400">
            {table.columns.length}
          </span>
        </div>
        <TableMenu onAddColumn={handleAddColumn} onDelete={() => deleteTable(table.id)} />
      </div>

      {isOpen && (
        <div className="pb-2">
          <div className="mx-1 space-y-px">
            {table.columns.map((col) => (
              <ColumnRow key={col.id} col={col} tableId={table.id} />
            ))}
          </div>

          <div className="mx-3 mt-1">
            <button
              onClick={handleAddColumn}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-400 transition-all hover:border-accent/40 hover:bg-accent/[0.03] hover:text-accent"
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
  const addTable = useSchemaStore((s) => s.addTable);

  const handleAddTable = () => {
    const newId = genId();
    addTable({
      id: newId,
      name: `new_table_${tables.length + 1}`,
      position: { x: 100 + tables.length * 50, y: 100 + tables.length * 50 },
      columns: [
        {
          id: genId(),
          name: "id",
          type: "uuid",
          isPrimaryKey: true,
          isForeignKey: false,
          isNullable: false,
          isUnique: true,
          defaultValue: "gen_random_uuid()",
        },
      ],
    });
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
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          Tables
        </span>
        <span className="rounded-full bg-gray-200/60 px-1.5 py-[1px] font-mono text-[11px] text-gray-400">
          {tables.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tables.map((table) => (
          <TableItem
            key={table.id}
            table={table}
            isOpen={openTableId === table.id}
            onToggle={() => onOpenTable(openTableId === table.id ? null : table.id)}
          />
        ))}
      </div>

      <div className="border-t border-border p-3">
        <button
          onClick={handleAddTable}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-[13px] font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-surface-muted hover:text-gray-900 active:scale-[0.98]"
        >
          <Plus size={15} weight="bold" />
          New Table
        </button>
      </div>
    </div>
  );
}
