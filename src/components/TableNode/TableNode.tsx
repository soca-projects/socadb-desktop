import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import {
  TableIcon as Table,
  KeyIcon as Key,
  LinkIcon as Link,
} from "@phosphor-icons/react";
import type { Column } from "../../types/schema";
import { getColorVariants } from "../../utils/tableColors";
import { useThemeStore } from "../../stores/themeStore";

interface TableNodeData {
  label: string;
  columns: Column[];
  color?: string;
}

type TableNodeProps = NodeProps & { data: TableNodeData };

export const TableNode = memo(function TableNode({ data, selected }: TableNodeProps) {
  const isDark = useThemeStore((s) => s.theme === "dark");
  const variants = data.color ? getColorVariants(data.color, isDark) : null;

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
        <Table
          size={14}
          className="text-tertiary"
          style={variants ? { color: variants.dot } : undefined}
        />
        <span className="font-mono text-[13px] font-semibold text-primary">
          {data.label}
        </span>
      </div>

      <div className="py-1">
        {data.columns.map((col) => (
          <div
            key={col.id}
            className="group relative flex items-center gap-2 px-3.5 py-[7px] transition-colors last:rounded-b-[7px] hover:bg-surface-muted"
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
              {col.isPrimaryKey ? (
                <Key size={13} className="text-amber-500" />
              ) : col.isForeignKey ? (
                <Link size={13} className="text-blue-500" />
              ) : (
                <span className="h-1.5 w-1.5" />
              )}
            </div>

            <span
              className={`flex-1 font-mono text-xs ${
                col.isPrimaryKey ? "font-medium text-primary" : "text-secondary"
              }`}
            >
              {col.name}
            </span>

            <span className="font-mono text-[11px] text-tertiary">{col.type}</span>

            {(col.isNullable || col.isUnique) && (
              <div className="flex items-center gap-1">
                {col.isNullable && <span className="text-[11px] text-tertiary">?</span>}
                {col.isUnique && (
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
        ))}
      </div>
    </div>
  );
});
