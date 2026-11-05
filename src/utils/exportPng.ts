import { toBlob } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import { useThemeStore } from "../stores/themeStore";
import i18next from "../i18n";
import { CanvasChangedError, canvasImageOptions } from "./canvasImage";
import { logError, logWarn } from "./log";

export async function exportCanvasPng() {
  try {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;

    const { schema } = useSchemaStore.getState();

    const path = await save({
      defaultPath: `${schema.name || "schema"}.png`,
      filters: [{ name: i18next.t("fileFilter.png"), extensions: ["png"] }],
    });
    if (!path) return;
    if (!viewport.isConnected || useSchemaStore.getState().schema !== schema) {
      throw new CanvasChangedError();
    }

    const blob = await toBlob(viewport, {
      ...canvasImageOptions(),
      backgroundColor: useThemeStore.getState().theme === "dark" ? "#1c1b1a" : "#FFFCF6",
      pixelRatio: 2,
    });
    if (!blob) {
      logWarn("export.png.render_failed", "PNG generation returned nothing");
      toast.error(i18next.t("toast.exportPngGenFailed"));
      return;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(path, bytes);
  } catch (e) {
    if (e instanceof CanvasChangedError) {
      logWarn("export.canvas_changed", e.message);
      toast.error(i18next.t("toast.exportCanvasChanged"));
      return;
    }
    logError("export.png.failed", e);
    toast.error(i18next.t("toast.exportPngFailed", { error: String(e) }));
  }
}
