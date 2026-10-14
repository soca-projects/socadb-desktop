import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatTextIcon as ChatText,
  DotsThreeVerticalIcon as DotsThreeVertical,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { isUniqueColumn, typeLabel } from "../../utils/columnTypes";
import { ActionMenu } from "../ActionMenu/ActionMenu";
import { ColumnIcon } from "./ColumnIcon";
import type { Column, Table } from "../../types/schema";

interface ColumnRowProps {
  table: Table;
  column: Column;
  onEdit: () => void;
  onEditNote: () => void;
}

export function ColumnRow({ table, column, onEdit, onEditNote }: ColumnRowProps) {
  const { t } = useTranslation();
  const deleteColumn = useSchemaStore((s) => s.deleteColumn);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const unique = isUniqueColumn(table, column);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " "))
            return;
          e.preventDefault();
          onEdit();
        }}
        className="group relative mx-1 flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md pl-2.5 pr-2 transition-colors hover:bg-surface-muted"
      >
        <ColumnIcon column={column} />
        <span
          className={`min-w-0 truncate font-mono text-[12.5px] ${
            column.isPrimaryKey ? "font-medium text-primary" : "text-secondary"
          }`}
        >
          {column.name}
        </span>
        {column.note && (
          <span title={column.note} className="shrink-0 text-tertiary">
            <ChatText size={11} />
          </span>
        )}
        <span className="flex-1" />
        <span className="whitespace-nowrap font-mono text-[11px] text-tertiary">
          {typeLabel(column)}
        </span>
        <span
          className={`flex min-w-[26px] justify-end gap-[3px] font-mono text-[11px] text-tertiary ${
            menu ? "invisible" : "group-focus-within:invisible group-hover:invisible"
          }`}
        >
          {column.isNullable && <span>?</span>}
          {unique && <span className="font-medium">U</span>}
        </span>
        <button
          type="button"
          onMouseDown={(e) => {
            // Otherwise the menu's outside-click closes it and this click reopens it.
            if (menu) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { x: r.left, y: r.bottom + 4 });
          }}
          aria-label={t("sidePanel.columnOptions")}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          className={`absolute right-1.5 rounded-[4px] bg-surface-muted p-1 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 ${
            menu ? "text-primary opacity-100" : "text-tertiary opacity-0"
          }`}
        >
          <DotsThreeVertical size={13} weight="bold" />
        </button>
      </div>
      {menu && (
        <ActionMenu
          x={menu.x}
          y={menu.y}
          label={t("sidePanel.columnOptions")}
          onClose={() => setMenu(null)}
          items={[
            { label: t("sidePanel.editColumn"), onSelect: onEdit },
            {
              label: column.note ? t("sidePanel.editNote") : t("sidePanel.addNote"),
              onSelect: onEditNote,
            },
            {
              label: t("sidePanel.deleteColumn"),
              danger: true,
              separatorBefore: true,
              onSelect: () => deleteColumn(table.id, column.id),
            },
          ]}
        />
      )}
    </>
  );
}
