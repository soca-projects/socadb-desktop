import { getCurrentWindow } from "@tauri-apps/api/window";
import { useThemeStore, type ThemePreference } from "../stores/themeStore";
import { logWarn } from "./log";
import { IS_LINUX } from "./platform";

function applyWindowTheme(preference: ThemePreference) {
  getCurrentWindow()
    .setTheme(preference === "system" ? null : preference)
    .catch((e: unknown) => logWarn("window.theme.set_failed", e));
}

// The page's prefers-color-scheme follows the window's theme: System hands the
// window back to the OS, and the store settles on the OS theme through the
// media query's change event.
export function initWindowTheme() {
  // tao takes null as light on Linux, not as the desktop's theme.
  if (IS_LINUX) return;
  applyWindowTheme(useThemeStore.getState().preference);
  useThemeStore.subscribe((state, prev) => {
    if (state.preference !== prev.preference) applyWindowTheme(state.preference);
  });
}
