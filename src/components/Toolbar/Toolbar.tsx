import {
  SidebarIcon as Sidebar,
  ShuffleIcon as Shuffle,
  DownloadSimpleIcon as DownloadSimple,
  ArrowCounterClockwiseIcon as Undo,
  ArrowClockwiseIcon as Redo,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { handleAutoLayout, handleUndo, handleRedo } from "../../utils/schemaActions";
import { exportCanvasPng } from "../../utils/exportPng";

interface ToolbarProps {
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
}

function getFileName(filePath: string | null): string {
  if (!filePath) return "Untitled";
  const name = filePath.split("/").pop() ?? filePath;
  return name.replace(/\.soca$/, "");
}

export function Toolbar({ isSidePanelOpen, onToggleSidePanel }: ToolbarProps) {
  const filePath = useSchemaStore((s) => s.filePath);
  const schemaName = useSchemaStore((s) => s.schema.name);

  const displayName = filePath ? getFileName(filePath) : schemaName;

  return (
    <div className="flex h-12 items-center gap-4 border-b border-border bg-white px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidePanel}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-surface-muted hover:text-gray-600"
          title={isSidePanelOpen ? "Hide side panel" : "Show side panel"}
        >
          <Sidebar size={18} />
        </button>
        <div className="h-5 w-px bg-border" />
        <span className="text-sm font-medium text-gray-800">{displayName}</span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-2">
        <button
          onClick={() => void handleAutoLayout()}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[13px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-surface-muted hover:text-gray-800"
        >
          <Shuffle size={15} />
          Reorg
        </button>
        <button
          onClick={() => void exportCanvasPng()}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[13px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-surface-muted hover:text-gray-800"
        >
          <DownloadSimple size={15} />
          Export
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-surface-muted hover:text-gray-600"
          title="Undo"
        >
          <Undo size={16} />
        </button>
        <button
          onClick={handleRedo}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-surface-muted hover:text-gray-600"
          title="Redo"
        >
          <Redo size={16} />
        </button>
      </div>
    </div>
  );
}
