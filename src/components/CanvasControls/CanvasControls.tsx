import { useTranslation } from "react-i18next";
import { useReactFlow, useStore, Panel } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import {
  MinusIcon as Minus,
  PlusIcon as Plus,
  CornersOutIcon as CornersOut,
  ArrowCounterClockwiseIcon as Undo,
  ArrowClockwiseIcon as Redo,
  ShuffleIcon as Shuffle,
} from "@phosphor-icons/react";
import { useStore as useZustandStore } from "zustand";
import { handleAutoLayout, handleUndo, handleRedo } from "../../utils/schemaActions";
import { useSchemaStore } from "../../stores/schemaStore";

const zoomSelector = (s: ReactFlowState) => Math.round(s.transform[2] * 100);

const btnClass =
  "px-2 py-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary";
const btnDisabledClass = "px-2 py-1.5 text-muted cursor-not-allowed";

export function CanvasControls() {
  const { t } = useTranslation();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const percentage = useStore(zoomSelector);
  const canUndo = useZustandStore(
    useSchemaStore.temporal,
    (s) => s.pastStates.length > 0,
  );
  const canRedo = useZustandStore(
    useSchemaStore.temporal,
    (s) => s.futureStates.length > 0,
  );

  return (
    <Panel position="bottom-left">
      <div className="flex items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-lg bg-surface shadow-soft">
          <button
            onClick={() => void zoomOut()}
            className={btnClass}
            title={t("canvas.zoomOut")}
            aria-label={t("canvas.zoomOut")}
          >
            <Minus size={14} />
          </button>
          <span className="min-w-[42px] border-x border-border-light px-2 py-1.5 text-center font-mono text-[11px] text-tertiary">
            {percentage}%
          </span>
          <button
            onClick={() => void zoomIn()}
            className={btnClass}
            title={t("canvas.zoomIn")}
            aria-label={t("canvas.zoomIn")}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => void fitView({ padding: 0.2 })}
            className={`border-l border-border-light ${btnClass}`}
            title={t("canvas.fitView")}
            aria-label={t("canvas.fitView")}
          >
            <CornersOut size={14} />
          </button>
        </div>

        <div className="flex items-center overflow-hidden rounded-lg bg-surface shadow-soft">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className={canUndo ? btnClass : btnDisabledClass}
            title={t("canvas.undo")}
            aria-label={t("canvas.undo")}
          >
            <Undo size={14} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className={`border-l border-border-light ${canRedo ? btnClass : btnDisabledClass}`}
            title={t("canvas.redo")}
            aria-label={t("canvas.redo")}
          >
            <Redo size={14} />
          </button>
          <button
            onClick={() => void handleAutoLayout()}
            className={`border-l border-border-light ${btnClass}`}
            title={t("canvas.autoLayout")}
            aria-label={t("canvas.autoLayout")}
          >
            <Shuffle size={14} />
          </button>
        </div>
      </div>
    </Panel>
  );
}
