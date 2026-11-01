import { useTranslation } from "react-i18next";
import {
  SidebarIcon as Sidebar,
  CornersOutIcon as CornersOut,
  GearSixIcon as GearSix,
  SquaresFourIcon as SquaresFour,
} from "@phosphor-icons/react";
import { useSchemaStore } from "../../stores/schemaStore";
import { useViewStore } from "../../stores/viewStore";
import { useWindowStore } from "../../stores/windowStore";
import { showsWindowButtons } from "../../utils/windowButtons";
import { formatShortcut, IS_MAC } from "../../utils/platform";
import { logInfo } from "../../utils/log";

// trafficLightPosition in tauri.conf.json centers the lights on this bar,
// 20 px from the left edge, and ends them at 80 px; this keeps the gap they
// have between them. The right-hand icons end 20 px from the other edge.
const TRAFFIC_LIGHTS_WIDTH = 82;

interface ToolbarProps {
  variant?: "editor" | "home";
  isSidePanelOpen?: boolean;
  onToggleSidePanel?: () => void;
  onToggleFocusMode?: () => void;
}

function getFileName(filePath: string | null, fallback: string): string {
  if (!filePath) return fallback;
  // Split on both separators so Windows paths (C:\Users\…) work as well as
  // POSIX paths. Some callers also build mixed-separator paths via string
  // concatenation, so the regex covers both forms in any combination.
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  return name.replace(/\.soca$/, "");
}

export function Toolbar({
  variant = "editor",
  isSidePanelOpen,
  onToggleSidePanel,
  onToggleFocusMode,
}: ToolbarProps) {
  const windowButtonsShown = useWindowStore((s) => showsWindowButtons(s.fullscreen));
  const { t } = useTranslation();
  const isHome = variant === "home";
  const showHome = useViewStore((s) => s.showHome);
  const openSettings = useViewStore((s) => s.openSettings);
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
      className="flex h-10 items-center border-b border-border bg-surface-paper pr-[13px]"
    >
      <div
        className="flex items-center gap-1"
        style={{ paddingLeft: IS_MAC && windowButtonsShown ? TRAFFIC_LIGHTS_WIDTH : 16 }}
      >
        <button
          type="button"
          onClick={() => {
            logInfo("ui.action", "toolbar.home");
            showHome();
          }}
          aria-current={isHome ? "page" : undefined}
          className={`rounded-md p-1.5 transition-colors hover:bg-surface-paper-muted hover:text-secondary ${
            isHome ? "text-primary" : "text-tertiary"
          }`}
          title={`${t("toolbar.home")} (${formatShortcut(["Mod", "Shift", "H"])})`}
          aria-label={t("toolbar.home")}
        >
          <SquaresFour size={18} />
        </button>
        {!isHome && (
          <button
            onClick={onToggleSidePanel}
            className={`rounded-md p-1.5 transition-colors hover:bg-surface-paper-muted hover:text-secondary ${
              isSidePanelOpen ? "text-secondary" : "text-tertiary"
            }`}
            title={isSidePanelOpen ? t("toolbar.hidePanel") : t("toolbar.showPanel")}
            aria-label={isSidePanelOpen ? t("toolbar.hidePanel") : t("toolbar.showPanel")}
          >
            <Sidebar size={18} />
          </button>
        )}
      </div>

      <div
        data-tauri-drag-region
        className="flex flex-1 items-center justify-center gap-2"
      >
        {!isHome && (
          <>
            <span
              className="text-sm font-medium text-primary"
              title={isDirty ? t("toolbar.unsavedChanges") : undefined}
            >
              {isDirty && <span className="text-base text-tertiary">• </span>}
              {displayName}
            </span>
            <span className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-tertiary">
              {dbType === "mysql" ? t("toolbar.mysql") : t("toolbar.postgresql")}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        {!isHome && (
          <button
            onClick={onToggleFocusMode}
            className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-paper-muted hover:text-secondary"
            title={t("toolbar.focusMode")}
            aria-label={t("toolbar.focusMode")}
          >
            <CornersOut size={16} />
          </button>
        )}
        <button
          onClick={openSettings}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-paper-muted hover:text-secondary"
          title={`${t("toolbar.settings")} (${formatShortcut(["Mod", ","])})`}
          aria-label={t("toolbar.settings")}
        >
          <GearSix size={16} />
        </button>
      </div>
    </div>
  );
}
