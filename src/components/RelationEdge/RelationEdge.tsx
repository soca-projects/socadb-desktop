import { memo, useState } from "react";
import { EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { RelationType } from "../../types/schema";
import { useSchemaStore } from "../../stores/schemaStore";

const RELATION_TYPES: RelationType[] = ["1:1", "1:N", "N:1"];

interface RelationEdgeData {
  relationType: RelationType;
}

type RelationEdgeProps = EdgeProps & { data: RelationEdgeData };

export const RelationEdge = memo(function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: RelationEdgeProps) {
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke={hovered && !selected ? "#4F46E520" : "transparent"}
        strokeWidth={12}
        strokeLinecap="round"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer", transition: "stroke 0.15s" }}
      />
      <path
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        style={{
          stroke: selected ? "#4F46E5" : hovered ? "#6366F1" : "#94a3b8",
          strokeWidth: selected ? 2.5 : 1.5,
          transition: "stroke 0.15s, stroke-width 0.15s",
          pointerEvents: "none",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
            zIndex: selected ? 1000 : 0,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {selected ? (
            <div className="nodrag nopan flex items-center gap-0.5 rounded-lg border border-border bg-white p-1 shadow-float">
              {RELATION_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={(e) => {
                    e.stopPropagation();
                    useSchemaStore.getState().updateRelation(id, { type });
                  }}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] font-medium transition-colors ${
                    data.relationType === type
                      ? "bg-accent text-white"
                      : "text-gray-500 hover:bg-surface-muted hover:text-gray-700"
                  }`}
                >
                  {type}
                </button>
              ))}
              <div className="mx-0.5 h-5 w-px bg-border" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useSchemaStore.getState().deleteRelation(id);
                }}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <Trash size={13} />
              </button>
            </div>
          ) : (
            <div
              className={`nodrag nopan rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium shadow-soft transition-colors ${
                hovered
                  ? "border-accent/30 bg-accent-light text-accent"
                  : "border-gray-200 bg-white text-gray-400"
              }`}
            >
              {data.relationType}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
