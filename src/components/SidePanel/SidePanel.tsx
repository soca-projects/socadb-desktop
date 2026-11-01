import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { createTable } from "../../utils/schemaActions";
import { TableItem, type ColumnFocus } from "./TableItem";
import { GhostTableSketch } from "../Sketch/Sketch";

interface SidePanelProps {
  isOpen: boolean;
  openTableId: string | null;
  onOpenTable: (id: string | null) => void;
}

export const SidePanel = memo(function SidePanel({
  isOpen,
  openTableId,
  onOpenTable,
}: SidePanelProps) {
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

  const renameTable = useCallback(
    (id: string) => {
      onOpenTable(id);
      setRenamingTableId(id);
    },
    [onOpenTable],
  );
  const endRename = useCallback(() => setRenamingTableId(null), []);
  const goToColumn = useCallback(
    (tableId: string, columnId: string) => {
      setEditing({ tableId, columnId, note: false, selectName: false });
      onOpenTable(tableId);
    },
    [onOpenTable],
  );

  const handleAddTable = () => {
    const newId = createTable({ reveal: true });
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
          <div className="flex animate-fade-in flex-col items-center gap-2 px-4 pt-10 text-center">
            <GhostTableSketch className="h-[42px] w-14" />
            <p className="text-[13px] leading-relaxed text-tertiary">
              {t("sidePanel.emptyState")}
            </p>
          </div>
        ) : (
          tables.map((table) => (
            <TableItem
              key={table.id}
              table={table}
              isOpen={openTableId === table.id}
              isRenaming={renamingTableId === table.id}
              onOpenTable={onOpenTable}
              onRename={renameTable}
              onRenameEnd={endRename}
              editing={editing?.tableId === table.id ? editing : null}
              onEdit={setEditing}
              onGoToColumn={goToColumn}
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
});
