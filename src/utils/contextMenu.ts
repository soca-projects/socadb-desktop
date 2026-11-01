function onSelectedText(x: number, y: number): boolean {
  const selection = window.getSelection();
  if (!selection) return false;
  for (let i = 0; i < selection.rangeCount; i++) {
    const rects = Array.from(selection.getRangeAt(i).getClientRects());
    if (rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) {
      return true;
    }
  }
  return false;
}

// WebKit's own menu offers Reload, which reloads the whole app. Fields and
// selected text keep it for Copy, Paste and Look Up. Beside a selection WebKit
// shows its page menu, Reload included.
export function blockWebContextMenu(
  event: Pick<MouseEvent, "target" | "clientX" | "clientY" | "preventDefault">,
) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("input, textarea")) return;
  if (onSelectedText(event.clientX, event.clientY)) return;
  event.preventDefault();
}

export function initContextMenu() {
  document.addEventListener("contextmenu", blockWebContextMenu);
}
