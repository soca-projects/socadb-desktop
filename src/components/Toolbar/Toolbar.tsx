import { useState, useCallback, useRef } from "react";
import {
  SidebarIcon as Sidebar,
  DownloadSimpleIcon as DownloadSimple,
  ImageIcon as Image,
  FileCodeIcon as FileCode,
  FileSvgIcon as FileSvg,
  GearSixIcon as GearSix,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useClickOutside } from "../../hooks/useClickOutside";
import { exportCanvasPng } from "../../utils/exportPng";
import { exportCanvasSvg } from "../../utils/exportSvg";
import { exportSql } from "../../utils/exportSql";

interface ToolbarProps {
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onOpenAgentSetup: () => void;
}

function getFileName(filePath: string | null): string {
  if (!filePath) return "Untitled";
  const name = filePath.split("/").pop() ?? filePath;
  return name.replace(/\.soca$/, "");
}

function ExportDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dbType = useSchemaStore((s) => s.schema.dbType);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const items = [
    {
      label: "Export PNG",
      icon: <Image size={15} />,
      action: () => void exportCanvasPng(),
    },
    {
      label: "Export SVG",
      icon: <FileSvg size={15} />,
      action: () => void exportCanvasSvg(),
    },
    {
      label: `Export SQL (${dbType === "mysql" ? "MySQL" : "PostgreSQL"})`,
      icon: <FileCode size={15} />,
      action: () => void exportSql(),
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-surface-muted hover:text-stone-600"
        title="Export"
        aria-label="Export"
      >
        <DownloadSimple size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-float">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.action();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-700 transition-colors hover:bg-surface-muted"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  isSidePanelOpen,
  onToggleSidePanel,
  onOpenAgentSetup,
}: ToolbarProps) {
  const filePath = useSchemaStore((s) => s.filePath);
  const schemaName = useSchemaStore((s) => s.schema.name);
  const dbType = useSchemaStore((s) => s.schema.dbType);
  const isDirty = useSchemaStore((s) => s.savedAt !== s.schema.updatedAt);
  const displayName = filePath ? getFileName(filePath) : schemaName;

  return (
    <div className="flex h-12 items-center border-b border-border bg-surface px-4">
      <button
        onClick={onToggleSidePanel}
        className={`rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-stone-600 ${
          isSidePanelOpen ? "text-stone-600" : "text-stone-400"
        }`}
        title={isSidePanelOpen ? "Hide side panel" : "Show side panel"}
        aria-label={isSidePanelOpen ? "Hide side panel" : "Show side panel"}
      >
        <Sidebar size={18} />
      </button>

      <div className="flex flex-1 items-center justify-center gap-2">
        <span
          className="text-sm font-medium text-stone-800"
          title={isDirty ? "Unsaved changes" : undefined}
        >
          {isDirty && <span className="text-base text-stone-400">• </span>}
          {displayName}
        </span>
        <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-stone-400">
          {dbType === "mysql" ? "MySQL" : "PostgreSQL"}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <ExportDropdown />
        <button
          onClick={onOpenAgentSetup}
          className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-surface-muted hover:text-stone-600"
          title="Agent settings"
          aria-label="Agent settings"
        >
          <GearSix size={16} />
        </button>
      </div>
    </div>
  );
}
