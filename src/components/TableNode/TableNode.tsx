import { memo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import {
  TableIcon as TableGlyph,
  KeyIcon as Key,
  LinkIcon as Link,
  ChatTextIcon as ChatText,
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import type { DbType, SchemaEnum, Table } from "../../types/schema";
import { getColorVariants } from "../../utils/tableColors";
import { isUniqueColumn, typeLabel } from "../../utils/columnTypes";
import { indexColumnNames, litColumnIds } from "../../utils/indexHelpers";
import { useThemeStore } from "../../stores/themeStore";
import { useViewStore } from "../../stores/viewStore";

interface TableNodeData {
  table: Table;
  enums: SchemaEnum[];
  dbType: DbType;
}

type TableNodeProps = NodeProps & { data: TableNodeData };

// Kept inside the node, not portalled: React Flow draws its panels (the canvas
// controls) above the whole viewport, so a node never covers them, whatever
// its z-index.
function HoverCard({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`pointer-events-none absolute top-[calc(100%+6px)] z-10 hidden w-max max-w-[230px] whitespace-pre-line rounded-lg [overflow-wrap:anywhere] border border-border bg-surface px-2.5 py-2 text-left font-sans text-xs font-normal leading-[1.45] text-secondary shadow-float group-hover/hover:block ${
        align === "left" ? "-left-3" : "-right-3"
      }`}
    >
      {children}
    </span>
  );
}

export const TableNode = memo(function TableNode({ id, data, selected }: TableNodeProps) {
  const { t } = useTranslation();
  const { table, enums, dbType } = data;
  const isDark = useThemeStore((s) => s.theme === "dark");
  const indexesOpen = useViewStore((s) => s.indexesOpen.has(id));
  const toggleIndexes = useViewStore((s) => s.toggleIndexes);
  const [litId, setLitId] = useState<string | null>(null);
  const variants = table.color ? getColorVariants(table.color, isDark) : null;
  const indexes = table.indexes ?? [];
  const lit = indexesOpen ? litColumnIds(indexes, litId) : null;

  return (
    <div
      className={`min-w-[220px] animate-node-appear select-none rounded-lg border bg-surface shadow-card transition-shadow ${
        selected
          ? "border-accent ring-2 ring-accent/20"
          : "border-border hover:shadow-float"
      }`}
    >
      <div
        className="flex items-center gap-2 rounded-t-lg border-b border-border px-3.5 py-2.5"
        style={variants ? { backgroundColor: variants.bg } : undefined}
      >
        <TableGlyph
          size={14}
          className="text-tertiary"
          style={variants ? { color: variants.dot } : undefined}
        />
        <span className="font-mono text-[13px] font-semibold text-primary">
          {table.name}
        </span>
        {table.note && (
          <span className="group/hover relative text-tertiary">
            <ChatText size={12} />
            <HoverCard>{table.note}</HoverCard>
          </span>
        )}
      </div>

      <div className="py-1">
        {table.columns.map((col) => {
          const order = lit?.indexOf(col.id) ?? -1;
          const columnEnum =
            col.type === "enum" ? enums.find((e) => e.id === col.enumId) : undefined;
          const unique = isUniqueColumn(table, col);
          return (
            <div
              key={col.id}
              className={`group relative flex items-center gap-2 px-3.5 py-[7px] transition-colors hover:bg-surface-muted ${
                indexes.length ? "" : "last:rounded-b-[7px]"
              } ${order >= 0 ? "bg-accent/[0.08]" : ""}`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.id}-target`}
                className="!h-3 !w-px !rounded-none !border-0 !bg-transparent"
                style={{ top: "50%", left: -1, transform: "translateY(-50%)" }}
              />
              <span
                className={`pointer-events-none absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-[opacity,transform,border-color] duration-150 ${
                  selected
                    ? "scale-100 border-accent opacity-100"
                    : "scale-90 border-border opacity-60 group-hover:scale-100 group-hover:border-border-hover group-hover:opacity-100"
                }`}
              />

              <div className="flex w-4 items-center justify-center">
                {order >= 0 ? (
                  <span className="grid h-[15px] w-[15px] place-items-center rounded-full bg-accent font-mono text-[9.5px] font-semibold text-white">
                    {order + 1}
                  </span>
                ) : col.isPrimaryKey ? (
                  <Key size={13} className="text-badge-primary" />
                ) : col.isForeignKey ? (
                  <Link size={13} className="text-badge-unique" />
                ) : (
                  <span className="h-1.5 w-1.5" />
                )}
              </div>

              <span
                className={`flex flex-1 items-center gap-[5px] font-mono text-xs ${
                  col.isPrimaryKey || order >= 0 ? "text-primary" : "text-secondary"
                } ${col.isPrimaryKey ? "font-medium" : ""}`}
              >
                {col.name}
                {col.note && (
                  <span className="group/hover relative text-tertiary">
                    <ChatText size={11} />
                    <HoverCard>{col.note}</HoverCard>
                  </span>
                )}
              </span>

              {columnEnum ? (
                <span className="group/hover relative font-mono text-[11px] text-tertiary underline decoration-border-hover decoration-dotted underline-offset-[3px]">
                  {typeLabel(col)}
                  <HoverCard align="right">
                    {dbType === "postgresql" && (
                      <span className="mb-1 block font-mono text-[11px] text-tertiary">
                        {columnEnum.name}
                      </span>
                    )}
                    <span className="block font-mono text-[11px] leading-[1.7] text-secondary">
                      {columnEnum.values.join(", ") || t("canvas.noValues")}
                    </span>
                  </HoverCard>
                </span>
              ) : (
                <span className="font-mono text-[11px] text-tertiary">
                  {typeLabel(col)}
                </span>
              )}

              {(col.isNullable || unique) && (
                <div className="flex items-center gap-1">
                  {col.isNullable && <span className="text-[11px] text-tertiary">?</span>}
                  {unique && (
                    <span className="text-[11px] font-medium text-tertiary">U</span>
                  )}
                </div>
              )}

              <Handle
                type="source"
                position={Position.Right}
                id={`${col.id}-source`}
                className="!h-3 !w-px !rounded-none !border-0 !bg-transparent"
                style={{ top: "50%", right: -1, transform: "translateY(-50%)" }}
              />
              <span
                className={`pointer-events-none absolute right-0 top-1/2 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface transition-[opacity,transform,border-color] duration-150 ${
                  selected
                    ? "scale-100 border-accent opacity-100"
                    : "scale-90 border-border opacity-60 group-hover:scale-100 group-hover:border-border-hover group-hover:opacity-100"
                }`}
              />
            </div>
          );
        })}
      </div>

      {indexes.length > 0 && (
        // The width comes from the columns: a long index line is cut, never
        // widens the table.
        <div
          className={`w-0 min-w-full border-t border-border-light ${indexesOpen ? "pb-1.5" : ""}`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleIndexes(id);
            }}
            aria-expanded={indexesOpen}
            className="nodrag flex h-7 w-full items-center gap-1.5 px-3.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-tertiary hover:text-primary"
          >
            {t("canvas.indexes")}
            <span className="rounded-full bg-surface-muted px-[5px] font-mono text-[10px] tracking-normal">
              {indexes.length}
            </span>
            <span className="ml-auto">
              {indexesOpen ? <CaretDown size={10} /> : <CaretRight size={10} />}
            </span>
          </button>
          {indexesOpen &&
            indexes.map((index) => {
              const names = indexColumnNames(table, index).join(", ");
              return (
                <div
                  key={index.id}
                  title={index.unique ? `${names} (${t("canvas.unique")})` : names}
                  onMouseEnter={() => setLitId(index.id)}
                  onMouseLeave={() => setLitId(null)}
                  className="flex h-6 items-center gap-1.5 px-3.5 font-mono text-[11.5px] text-secondary last:rounded-b-[7px] hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1 truncate">{names}</span>
                  {index.unique && (
                    <span className="text-[10px] font-medium text-badge-unique">
                      {t("canvas.unique")}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
});
