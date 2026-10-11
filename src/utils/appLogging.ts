import i18next from "../i18n";
import { useThemeStore } from "../stores/themeStore";
import { useViewStore } from "../stores/viewStore";
import { getStartupPreference } from "./startupPreference";
import { logError, logInfo } from "./log";

let initialized = false;

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
  useViewStore.subscribe((state, prev) => {
    if (state.view !== prev.view) logInfo("view.change", state.view);
  });
}
