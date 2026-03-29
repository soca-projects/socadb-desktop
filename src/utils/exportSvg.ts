import { toSvg } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import { useThemeStore } from "../stores/themeStore";
import i18next from "../i18n";

export async function exportCanvasSvg() {
  try {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;

    const schemaName = useSchemaStore.getState().schema.name || "schema";

    const [svg, path] = await Promise.all([
      toSvg(viewport, {
        backgroundColor:
          useThemeStore.getState().theme === "dark" ? "#1c1b1a" : "#FDFCFC",
      }),
      save({
        defaultPath: `${schemaName}.svg`,
        filters: [{ name: i18next.t("fileFilter.svg"), extensions: ["svg"] }],
      }),
    ]);
    if (!svg || !path) return;

    await writeTextFile(path, svg);
  } catch (e) {
    toast.error(i18next.t("toast.exportSvgFailed", { error: String(e) }));
  }
}
