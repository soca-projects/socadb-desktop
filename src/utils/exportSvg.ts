import { toSvg } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import { useThemeStore } from "../stores/themeStore";
import i18next from "../i18n";
import { CanvasChangedError, canvasImageOptions, withSvgBackground } from "./canvasImage";
import { logError, logWarn } from "./log";

export async function exportCanvasSvg() {
  try {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;

    const { schema } = useSchemaStore.getState();

    const path = await save({
      defaultPath: `${schema.name || "schema"}.svg`,
      filters: [{ name: i18next.t("fileFilter.svg"), extensions: ["svg"] }],
    });
    if (!path) return;

    if (!viewport.isConnected || useSchemaStore.getState().schema !== schema) {
      throw new CanvasChangedError();
    }
    const dataUrl = await toSvg(viewport, canvasImageOptions());
    const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
    const background = useThemeStore.getState().theme === "dark" ? "#1c1b1a" : "#FFFCF6";
    await writeTextFile(path, withSvgBackground(svg, background));
  } catch (e) {
    if (e instanceof CanvasChangedError) {
      logWarn("export.canvas_changed", e.message);
      toast.error(i18next.t("toast.exportCanvasChanged"));
      return;
    }
    logError("export.svg.failed", e);
    toast.error(i18next.t("toast.exportSvgFailed", { error: String(e) }));
  }
}
