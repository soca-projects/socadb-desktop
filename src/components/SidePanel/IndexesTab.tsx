import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { genId } from "../../utils/id";
import { editIndex, type IndexEditing } from "../../utils/indexActions";
import { indexColumnNames, unindexedForeignKeys } from "../../utils/indexHelpers";
import type { Table, TableIndex } from "../../types/schema";
import { IndexEditor } from "./IndexEditor";

export function IndexesTab({ table }: { table: Table }) {
  const { t } = useTranslation();
  const dbType = useSchemaStore((s) => s.schema.dbType);
  const addIndex = useSchemaStore((s) => s.addIndex);
  const deleteIndex = useSchemaStore((s) => s.deleteIndex);
  const [editing, setEditing] = useState<IndexEditing | null>(null);
  const indexes = table.indexes ?? [];
  const hints = unindexedForeignKeys(table, dbType);
  const close = () => setEditing(null);

  const editor = (index: TableIndex, isDraft: boolean) => (
    <IndexEditor
      key={index.id}
      table={table}
      index={index}
      onChange={(updates) => setEditing(editIndex(table.id, index, isDraft, updates))}
      onDelete={() => {
        if (!isDraft) deleteIndex(table.id, index.id);
        close();
      }}
      onClose={close}
    />
  );

  return (
    <div>
      {hints.length > 0 && (
        <div className="mx-2 mb-2 mt-1 rounded border border-border bg-surface px-2.5 py-2 text-[12px] leading-[1.45] text-secondary">
          <Trans
            i18nKey="sidePanel.fkHint"
            count={hints.length}
            values={{ names: hints.map((c) => c.name).join(", ") }}
            components={{
              code: <code className="font-mono text-[11.5px] text-primary" />,
            }}
          />
          <div className="mt-1 flex flex-wrap gap-x-3">
            {hints.map((column) => (
              <button
                key={column.id}
                type="button"
                onClick={() =>
                  addIndex(table.id, {
                    id: genId(),
                    columnIds: [column.id],
                    unique: false,
                  })
                }
                className="font-mono text-[11px] text-secondary underline decoration-border-hover underline-offset-2 hover:decoration-current"
              >
                {t("sidePanel.addIndexOn", { name: column.name })}
              </button>
            ))}
          </div>
        </div>
      )}

      {!indexes.length && !editing?.draft && (
        <p className="mx-3.5 mb-1 mt-2 text-[12.5px] leading-[1.5] text-tertiary">
          {t(dbType === "mysql" ? "sidePanel.noIndexesMysql" : "sidePanel.noIndexes")}
        </p>
      )}

      {indexes.map((index) =>
        editing?.id === index.id ? (
          editor(index, false)
        ) : (
          <IndexRow
            key={index.id}
            table={table}
            index={index}
            onEdit={() => setEditing({ id: index.id, draft: null })}
            onDelete={() => deleteIndex(table.id, index.id)}
          />
        ),
      )}
      {editing?.draft && editor(editing.draft, true)}

      <button
        type="button"
        onClick={() => {
          const id = genId();
          setEditing({ id, draft: { id, columnIds: [], unique: false } });
        }}
        className="mx-1 mb-1 mt-0.5 flex h-[30px] w-[calc(100%-8px)] items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-tertiary transition-colors hover:bg-surface-muted hover:text-accent"
      >
        <Plus size={12} weight="bold" />
        {t("sidePanel.addIndex")}
      </button>
    </div>
  );
}

function IndexRow({
  table,
  index,
  onEdit,
  onDelete,
}: {
  table: Table;
  index: TableIndex;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const names = indexColumnNames(table, index).join(", ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        onEdit();
      }}
      className="group relative mx-1 flex h-[30px] items-center gap-2 rounded-md pl-2.5 pr-2 transition-colors hover:bg-surface-muted"
    >
      <span
        title={names}
        className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-primary"
      >
        {names}
      </span>
      {index.unique && (
        <span className="rounded-[4px] border border-badge-unique-border bg-badge-unique-bg px-1 font-mono text-[10px] font-medium text-badge-unique group-focus-within:invisible group-hover:invisible">
          UNIQUE
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label={t("sidePanel.deleteIndex")}
        title={t("sidePanel.deleteIndex")}
        className="absolute right-1.5 rounded-[4px] bg-surface-muted p-1 text-tertiary opacity-0 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:text-red-400"
      >
        <Trash size={13} />
      </button>
    </div>
  );
}
