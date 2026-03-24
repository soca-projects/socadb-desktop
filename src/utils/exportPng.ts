import { toBlob } from "html-to-image";
import { save, message } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useSchemaStore } from "../stores/schemaStore";

export async function exportCanvasPng() {
  try {
    const viewport = document.querySelector(
      ".react-flow__viewport",
    ) as HTMLElement | null;
    if (!viewport) return;

    const schemaName = useSchemaStore.getState().schema.name || "schema";

    const [blob, path] = await Promise.all([
      toBlob(viewport, { backgroundColor: "#FDFCFC", pixelRatio: 2 }),
      save({
        defaultPath: `${schemaName}.png`,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      }),
    ]);
    if (!path) return;
    if (!blob) {
      await message("Failed to generate image from canvas.", {
        title: "Export Error",
        kind: "error",
      });
      return;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(path, bytes);
  } catch (e) {
    await message(`Failed to export PNG: ${e}`, { title: "Export Error", kind: "error" });
  }
}
