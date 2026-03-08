import { useReactFlow, useViewport, Panel } from "@xyflow/react";
import {
  MinusIcon as Minus,
  PlusIcon as Plus,
  CornersOutIcon as CornersOut,
} from "@phosphor-icons/react";

export function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const percentage = Math.round(zoom * 100);

  return (
    <Panel position="bottom-left">
      <div className="flex items-center overflow-hidden rounded-lg border border-border bg-white shadow-soft">
        <button
          onClick={() => void zoomOut()}
          className="px-2 py-1.5 text-gray-500 transition-colors hover:bg-surface-muted hover:text-gray-700"
          title="Zoom out"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-[42px] border-x border-border-light px-2 py-1.5 text-center font-mono text-[11px] text-gray-500">
          {percentage}%
        </span>
        <button
          onClick={() => void zoomIn()}
          className="px-2 py-1.5 text-gray-500 transition-colors hover:bg-surface-muted hover:text-gray-700"
          title="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => void fitView({ padding: 0.2 })}
          className="border-l border-border-light px-2 py-1.5 text-gray-500 transition-colors hover:bg-surface-muted hover:text-gray-700"
          title="Fit view"
        >
          <CornersOut size={14} />
        </button>
      </div>
    </Panel>
  );
}
