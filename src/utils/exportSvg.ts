import { toSvg } from "html-to-image";
import { save, message } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useSchemaStore } from "../stores/schemaStore";

export async function exportCanvasSvg() {
  try {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;

    const schemaName = useSchemaStore.getState().schema.name || "schema";

    const [svg, path] = await Promise.all([
      toSvg(viewport, { backgroundColor: "#ffffff" }),
      save({
        defaultPath: `${schemaName}.svg`,
        filters: [{ name: "SVG Image", extensions: ["svg"] }],
      }),
    ]);
    if (!svg || !path) return;

    await writeTextFile(path, svg);
  } catch (e) {
    await message(`Failed to export SVG: ${e}`, { title: "Export Error", kind: "error" });
  }
}
