import { create } from "zustand";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("socadb_theme");
  if (stored === "light" || stored === "dark") return stored;
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.style.colorScheme = theme;
  localStorage.setItem("socadb_theme", theme);
}

function applyThemeWithTransition(theme: Theme) {
  const el = document.documentElement;
  el.dataset.themeTransition = "";
  applyTheme(theme);
  setTimeout(() => {
    delete el.dataset.themeTransition;
  }, 350);
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      applyThemeWithTransition(next);
      return { theme: next };
    });
  },
}));
