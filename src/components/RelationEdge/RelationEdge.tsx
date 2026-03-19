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
        stroke={hovered && !selected ? "var(--color-edge-hover-zone)" : "transparent"}
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
          stroke: selected
            ? "var(--color-edge-selected)"
            : hovered
              ? "var(--color-edge-hovered)"
              : "var(--color-edge-default)",
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
            <div className="nodrag nopan flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-float">
              {RELATION_TYPES.map((type) => (
                <button
                  key={type}
                  aria-pressed={data.relationType === type}
                  onClick={(e) => {
                    e.stopPropagation();
                    useSchemaStore.getState().updateRelation(id, { type });
                  }}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] font-medium transition-colors ${
                    data.relationType === type
                      ? "bg-accent text-white"
                      : "text-tertiary hover:bg-surface-muted hover:text-secondary"
                  }`}
                >
                  {type}
                </button>
              ))}
              <div className="mx-0.5 h-5 w-px bg-border" />
              <button
                aria-label="Delete relation"
                onClick={(e) => {
                  e.stopPropagation();
                  useSchemaStore.getState().deleteRelation(id);
                }}
                className="rounded-md p-1 text-tertiary transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash size={13} />
              </button>
            </div>
          ) : (
            <div
              className={`nodrag nopan cursor-pointer rounded border px-2 py-0.5 font-mono text-[11px] font-medium shadow-soft transition-[color,background-color,border-color,transform] duration-150 ${
                hovered
                  ? "scale-110 border-accent/30 bg-accent-light text-accent"
                  : "border-border bg-surface text-tertiary"
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
