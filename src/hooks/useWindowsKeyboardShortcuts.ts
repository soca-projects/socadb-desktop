import { useEffect } from "react";
import { MENU_SHORTCUTS } from "../utils/menuActions";
import { IS_WINDOWS } from "../utils/platform";

// Windows-only fallback for menu accelerators. Tauri 2's JS `setAsWindowMenu()`
// attaches the menu to the window for rendering and mouse interaction but does
// not call muda's `Menu::init_for_hwnd()`, which is the only path that hooks
// `TranslateAcceleratorW` into the Win32 message loop. The keyboard
// accelerators shown next to menu items therefore never fire on Windows.
// Tracked upstream as https://github.com/tauri-apps/tauri/issues/6365.
//
// macOS and Linux do not need this fallback — AppKit / GTK handle accelerators
// when the menu is attached.

const SIGNATURE_TO_RUN: Record<string, () => void | Promise<void>> = Object.fromEntries(
  Object.values(MENU_SHORTCUTS).map((s) => [s.windowsSignature, s.run]),
);

function buildSignature(e: KeyboardEvent): string | null {
  if (!e.ctrlKey) return null;
  const key = e.key.toLowerCase();
  // Ignore modifier-only keydowns (Ctrl alone, Shift alone, etc.)
  if (key === "control" || key === "shift" || key === "alt" || key === "meta") {
    return null;
  }
  const parts = ["ctrl"];
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(key);
  return parts.join("+");
}

export function useWindowsKeyboardShortcuts() {
  useEffect(() => {
    if (!IS_WINDOWS) return;

    function onKeyDown(e: KeyboardEvent) {
      const signature = buildSignature(e);
      if (!signature) return;
      const handler = SIGNATURE_TO_RUN[signature];
      if (!handler) return;
      // preventDefault stops WebView2 from running its built-in handler (e.g.
      // "Save page" for Ctrl+S). Capture phase ensures we beat textarea-local
      // shortcuts too.
      e.preventDefault();
      void handler();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
