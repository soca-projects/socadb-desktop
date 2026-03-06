import { useState } from "react";
import { useSchemaStore } from "../../stores/schemaStore";
import { genId } from "../../utils/id";
import { computeAutoLayout } from "../../utils/autoLayout";
import type { ColumnType, Table } from "../../types/schema";

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
  const updateColumn = useSchemaStore((s) => s.updateColumn);
  const deleteColumn = useSchemaStore((s) => s.deleteColumn);

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
    <div className="border-b border-gray-200">
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{isOpen ? "▼" : "▶"}</span>
          <span className="text-sm font-medium text-gray-900">{table.name}</span>
          <span className="text-xs text-gray-400">({table.columns.length})</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteTable(table.id);
          }}
          className="text-xs text-gray-300 hover:text-red-500"
          title="Delete table"
        >
          ✕
        </button>
      </div>

      {isOpen && (
        <div className="bg-gray-50 px-3 pb-3">
          <div className="mb-2">
            <input
              type="text"
              spellCheck={false}
              autoCorrect="off"
              defaultValue={table.name}
              onBlur={(e) => updateTable(table.id, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
              placeholder="Table name"
            />
          </div>

          <div className="space-y-1.5">
            {table.columns.map((col) => (
              <div key={col.id} className="rounded border border-gray-200 bg-white p-2">
                <div className="mb-1.5 flex items-center gap-1">
                  <input
                    type="text"
                    spellCheck={false}
                    autoCorrect="off"
                    defaultValue={col.name}
                    onBlur={(e) =>
                      updateColumn(table.id, col.id, { name: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                  <select
                    value={col.type}
                    onChange={(e) =>
                      updateColumn(table.id, col.id, {
                        type: e.target.value as ColumnType,
                      })
                    }
                    className="w-[85px] shrink-0 truncate rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    {COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteColumn(table.id, col.id)}
                    className="shrink-0 text-xs text-gray-300 hover:text-red-500"
                    title="Delete column"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={col.isPrimaryKey}
                      onChange={(e) =>
                        updateColumn(table.id, col.id, {
                          isPrimaryKey: e.target.checked,
                          ...(e.target.checked
                            ? { isUnique: true, isNullable: false }
                            : {}),
                        })
                      }
                      className="rounded"
                    />
                    PK
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={col.isNullable}
                      disabled={col.isPrimaryKey}
                      onChange={(e) =>
                        updateColumn(table.id, col.id, {
                          isNullable: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    Null
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500">
                    <input
                      type="checkbox"
                      checked={col.isUnique}
                      disabled={col.isPrimaryKey}
                      onChange={(e) =>
                        updateColumn(table.id, col.id, {
                          isUnique: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    Unique
                  </label>
                  <input
                    type="text"
                    spellCheck={false}
                    autoCorrect="off"
                    placeholder="default"
                    defaultValue={col.defaultValue ?? ""}
                    onBlur={(e) =>
                      updateColumn(table.id, col.id, {
                        defaultValue: e.target.value || null,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="flex-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddColumn}
            className="mt-2 w-full rounded border border-dashed border-gray-300 py-1 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500"
          >
            + Add Column
          </button>
        </div>
      )}
    </div>
  );
}

interface SidePanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function SidePanel({ isOpen, onToggle }: SidePanelProps) {
  const tables = useSchemaStore((s) => s.schema.tables);
  const relations = useSchemaStore((s) => s.schema.relations);
  const addTable = useSchemaStore((s) => s.addTable);
  const updateTablePositions = useSchemaStore((s) => s.updateTablePositions);
  const [openTableId, setOpenTableId] = useState<string | null>(null);

  const handleAutoLayout = async () => {
    const positions = await computeAutoLayout(tables, relations);
    updateTablePositions(positions);
  };

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
    setOpenTableId(newId);
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-0 top-0 z-20 rounded-br-md border-b border-r border-gray-200 bg-white px-2 py-2 text-xs text-gray-400 shadow-sm hover:text-gray-600"
      >
        ▶
      </button>
    );
  }

  return (
    <div className="fixed left-0 top-0 z-20 flex h-screen w-[280px] flex-col border-r border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Tables
        </span>
        <button onClick={onToggle} className="text-xs text-gray-400 hover:text-gray-600">
          ◀
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tables.map((table) => (
          <TableItem
            key={table.id}
            table={table}
            isOpen={openTableId === table.id}
            onToggle={() => setOpenTableId(openTableId === table.id ? null : table.id)}
          />
        ))}
      </div>

      <div className="flex gap-2 border-t border-gray-200 p-3">
        <button
          onClick={handleAddTable}
          className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          + New Table
        </button>
        <button
          onClick={() => void handleAutoLayout()}
          disabled={tables.length === 0}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Auto-layout
        </button>
      </div>
    </div>
  );
}
