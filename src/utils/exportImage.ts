import { exportCanvasPng } from "./exportPng";
import { exportCanvasSvg } from "./exportSvg";
import { focusTopModal } from "./modalStack";

export type ImageFormat = "png" | "svg";

// The modal stays over the canvas during the capture: a hovered row would land in
// the image. Going inert drops the focus to the page, where Delete would remove the
// selection, so the overlay takes it first.
export async function exportImageUnderModal(format: ImageFormat, markBusy: () => void) {
  focusTopModal();
  markBusy();
  await (format === "png" ? exportCanvasPng() : exportCanvasSvg());
}
