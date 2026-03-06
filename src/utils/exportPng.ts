import { toBlob } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useSchemaStore } from "../stores/schemaStore";

export async function exportCanvasPng() {
  const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewport) return;

  const schemaName = useSchemaStore.getState().schema.name || "schema";

  const [blob, path] = await Promise.all([
    toBlob(viewport, { backgroundColor: "#ffffff", pixelRatio: 2 }),
    save({
      defaultPath: `${schemaName}.png`,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    }),
  ]);
  if (!blob || !path) return;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeFile(path, bytes);
}
