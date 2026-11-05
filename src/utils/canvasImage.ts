import { getCanvasView } from "./canvasView";
import type { Rect } from "./tablePlacement";

const MARGIN_PX = 40;
// PNGs render at twice this size, and html-to-image shrinks a canvas past 16384 px a side.
const MAX_SIDE_PX = 8000;

export function imageFrame(bounds: Rect) {
  const fullWidth = bounds.width + 2 * MARGIN_PX;
  const fullHeight = bounds.height + 2 * MARGIN_PX;
  const scale = Math.min(1, MAX_SIDE_PX / fullWidth, MAX_SIDE_PX / fullHeight);
  const x = (MARGIN_PX - bounds.x) * scale;
  const y = (MARGIN_PX - bounds.y) * scale;
  return {
    width: Math.ceil(fullWidth * scale),
    height: Math.ceil(fullHeight * scale),
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
  };
}

export function canvasImageOptions() {
  const bounds = getCanvasView()?.contentBounds();
  if (!bounds) return {};
  const { width, height, transform } = imageFrame(bounds);
  return {
    width,
    height,
    style: { width: `${width}px`, height: `${height}px`, transform },
  };
}

// html-to-image paints its backgroundColor on the captured element, and the
// transform moves that element away from the image's corners.
export function withSvgBackground(svg: string, color: string): string {
  return svg.replace(
    /^<svg[^>]*>/,
    (open) => `${open}<rect width="100%" height="100%" fill="${color}"/>`,
  );
}
