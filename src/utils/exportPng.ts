import { toPng } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export async function exportCanvasPng() {
  const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!viewport) return;

  const dataUrl = await toPng(viewport, {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
  });

  const path = await save({
    defaultPath: "schema.png",
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (!path) return;

  const base64 = dataUrl.split(",")[1];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await writeFile(path, bytes);
}
