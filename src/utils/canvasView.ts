import type { Rect, Size } from "./tablePlacement";

export interface CanvasView {
  visibleArea: () => Rect | null;
  blockedAreas: () => Rect[];
  measuredSize: (tableId: string) => Size | null;
  reveal: (rect: Rect) => void;
}

let current: CanvasView | null = null;

export function setCanvasView(view: CanvasView | null) {
  current = view;
}

export function getCanvasView(): CanvasView | null {
  return current;
}
