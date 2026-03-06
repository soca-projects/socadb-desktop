import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { Column } from "../../types/schema";

interface TableNodeData {
  label: string;
  columns: Column[];
}

type TableNodeProps = NodeProps & { data: TableNodeData };

export function TableNode({ data, selected }: TableNodeProps) {
  return (
    <div
      className={`min-w-[220px] rounded-lg border bg-white shadow-sm ${
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
      }`}
    >
      <div className="rounded-t-lg border-b border-gray-200 bg-gray-50 px-3 py-2">
        <span className="text-sm font-semibold text-gray-900">{data.label}</span>
      </div>

      <div className="divide-y divide-gray-100">
        {data.columns.map((col) => (
          <div
            key={col.id}
            className="relative flex items-center gap-2 px-3 py-1.5 text-xs"
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.id}-target`}
              className="!h-2 !w-2 !border-gray-300 !bg-white"
              style={{ top: "50%" }}
            />

            <div className="flex items-center gap-1">
              {col.isPrimaryKey && (
                <span className="font-bold text-amber-500" title="Primary Key">
                  PK
                </span>
              )}
              {col.isForeignKey && (
                <span className="font-bold text-blue-500" title="Foreign Key">
                  FK
                </span>
              )}
            </div>

            <span
              className={`flex-1 ${col.isPrimaryKey ? "font-semibold" : ""} text-gray-800`}
            >
              {col.name}
            </span>

            <span className="text-gray-400">{col.type}</span>

            <div className="flex items-center gap-0.5">
              {col.isNullable && (
                <span className="text-gray-300" title="Nullable">
                  ?
                </span>
              )}
              {col.isUnique && (
                <span className="text-purple-400" title="Unique">
                  U
                </span>
              )}
            </div>

            <Handle
              type="source"
              position={Position.Right}
              id={`${col.id}-source`}
              className="!h-2 !w-2 !border-gray-300 !bg-white"
              style={{ top: "50%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
