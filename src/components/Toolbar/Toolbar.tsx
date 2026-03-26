import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  SidebarIcon as Sidebar,
  CornersOutIcon as CornersOut,
  GearSixIcon as GearSix,
} from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSchemaStore } from "../../stores/schemaStore";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";

const TRAFFIC_LIGHTS_WIDTH = 70;

interface ToolbarProps {
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onToggleFocusMode: () => void;
  onOpenAgentSetup: () => void;
}

function getFileName(filePath: string | null, fallback: string): string {
  if (!filePath) return fallback;
  const name = filePath.split("/").pop() ?? filePath;
  return name.replace(/\.soca$/, "");
}

export function Toolbar({
  isSidePanelOpen,
  onToggleSidePanel,
  onToggleFocusMode,
  onOpenAgentSetup,
}: ToolbarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    void win.isFullscreen().then(setIsFullscreen);
    const unlisten = win.onResized(() => {
      void win.isFullscreen().then(setIsFullscreen);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const { t } = useTranslation();
  const filePath = useSchemaStore((s) => s.filePath);
  const schemaName = useSchemaStore((s) => s.schema.name);
  const dbType = useSchemaStore((s) => s.schema.dbType);
  const isDirty = useSchemaStore((s) => s.savedAt !== s.schema.updatedAt);
  const displayName = filePath
    ? getFileName(filePath, t("toolbar.untitled"))
    : schemaName;

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center border-b border-border bg-surface pr-4"
    >
      <div
        className="flex items-center"
        style={{ paddingLeft: isFullscreen ? 16 : TRAFFIC_LIGHTS_WIDTH }}
      >
        <button
          onClick={onToggleSidePanel}
          className={`rounded-md p-1.5 transition-colors hover:bg-surface-muted hover:text-secondary ${
            isSidePanelOpen ? "text-secondary" : "text-tertiary"
          }`}
          title={isSidePanelOpen ? t("toolbar.hidePanel") : t("toolbar.showPanel")}
          aria-label={isSidePanelOpen ? t("toolbar.hidePanel") : t("toolbar.showPanel")}
        >
          <Sidebar size={18} />
        </button>
      </div>

      <div
        data-tauri-drag-region
        className="flex flex-1 items-center justify-center gap-2"
      >
        <span
          className="text-sm font-medium text-primary"
          title={isDirty ? t("toolbar.unsavedChanges") : undefined}
        >
          {isDirty && <span className="text-base text-tertiary">• </span>}
          {displayName}
        </span>
        <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-tertiary">
          {dbType === "mysql" ? t("toolbar.mysql") : t("toolbar.postgresql")}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onToggleFocusMode}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
          title={t("toolbar.focusMode")}
          aria-label={t("toolbar.focusMode")}
        >
          <CornersOut size={16} />
        </button>
        <ThemeToggle />
        <button
          onClick={onOpenAgentSetup}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
          title={t("toolbar.agentSettings")}
          aria-label={t("toolbar.agentSettings")}
        >
          <GearSix size={16} />
        </button>
      </div>
    </div>
  );
}
