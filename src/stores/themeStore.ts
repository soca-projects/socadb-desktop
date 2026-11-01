import { create } from "zustand";
import type { z } from "zod";
import { ThemePreferenceZ } from "../utils/zodSchemas";
import { logWarn } from "../utils/log";

type Theme = "light" | "dark";
export type ThemePreference = z.infer<typeof ThemePreferenceZ>;

// index.html reads this key before the first paint.
const STORAGE_KEY = "socadb_appearance";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

function systemTheme(): Theme {
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

function resolve(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

function storedPreference(): ThemePreference {
  try {
    const parsed = ThemePreferenceZ.safeParse(localStorage.getItem(STORAGE_KEY));
    if (parsed.success) return parsed.data;
  } catch (e) {
    logWarn("settings.theme.storage_failed", e);
  }
  return "system";
}

function applyTheme(theme: Theme, animate: boolean) {
  const el = document.documentElement;
  if (animate) {
    el.dataset.themeTransition = "";
    setTimeout(() => delete el.dataset.themeTransition, 350);
  }
  el.dataset.theme = theme;
  el.style.colorScheme = theme;
}

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference, animate?: boolean) => void;
  toggleTheme: () => void;
}

const initialPreference = storedPreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  theme: resolve(initialPreference),
  setPreference: (preference, animate = true) => {
    const theme = resolve(preference);
    applyTheme(theme, animate);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (e) {
      logWarn("settings.theme.storage_failed", e);
    }
    set({ preference, theme });
  },
  toggleTheme: () => get().setPreference(get().theme === "light" ? "dark" : "light"),
}));

export function followSystemTheme() {
  window.matchMedia(LIGHT_QUERY).addEventListener("change", () => {
    const { preference, setPreference } = useThemeStore.getState();
    if (preference === "system") setPreference("system");
  });
}
