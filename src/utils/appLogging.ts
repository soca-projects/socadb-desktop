import i18next from "../i18n";
import { useThemeStore } from "../stores/themeStore";
import { useViewStore } from "../stores/viewStore";
import { getStartupPreference } from "./startupPreference";
import { logDebug, logError, logInfo } from "./log";

let initialized = false;

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift"]);

// Only shortcuts, never the characters typed: those would be user content.
function shortcutOf(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [
    event.metaKey && "Meta",
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    MODIFIER_KEYS.has(event.key) ? null : key,
  ]
    .filter(Boolean)
    .join("+");
}

export function initAppLogging() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("error", (event) => {
    logError("ui.uncaught", event.error ?? event.message, {
      source: event.filename,
      line: event.lineno,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logError("ui.unhandled_rejection", event.reason);
  });
  logInfo("ui.start", "Interface loaded", {
    language: i18next.resolvedLanguage,
    theme: useThemeStore.getState().theme,
    view: useViewStore.getState().view,
    startup: getStartupPreference(),
  });
  if (import.meta.env.DEV) {
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.metaKey || event.ctrlKey) logDebug("ui.key", shortcutOf(event));
      },
      true,
    );
  }
  useViewStore.subscribe((state, prev) => {
    if (state.view !== prev.view) logInfo("view.change", state.view);
  });
}
