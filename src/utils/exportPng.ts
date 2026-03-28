import { toBlob } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import i18next from "../i18n";

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
        filters: [{ name: i18next.t("fileFilter.png"), extensions: ["png"] }],
      }),
    ]);
    if (!path) return;
    if (!blob) {
      toast.error(i18next.t("toast.exportPngGenFailed"));
      return;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(path, bytes);
  } catch (e) {
    toast.error(i18next.t("toast.exportPngFailed", { error: String(e) }));
  }
}
