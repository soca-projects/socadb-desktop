import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { RelationType } from "../../types/schema";

interface RelationEdgeData {
  relationType: RelationType;
}

type RelationEdgeProps = EdgeProps & { data: RelationEdgeData };

export function RelationEdge({
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
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "#2563eb" : "#94a3b8",
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 shadow-sm"
        >
          {data.relationType}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
