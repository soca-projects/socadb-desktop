import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const env = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const listeners = new Set<() => void>();
  const system = { light: false };
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      get matches() {
        return system.light;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    }),
  });
  vi.stubGlobal("document", { documentElement: root });
  return {
    storage,
    system,
    root,
    switchSystem(light: boolean) {
      system.light = light;
      for (const listener of listeners) listener();
    },
  };
});

import { followSystemTheme, useThemeStore } from "./themeStore";

followSystemTheme();

beforeEach(() => {
  env.system.light = false;
  useThemeStore.getState().setPreference("system", false);
  env.storage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("theme", () => {
  it("follows the system by default, live", () => {
    expect(useThemeStore.getState().preference).toBe("system");
    expect(useThemeStore.getState().theme).toBe("dark");
    env.switchSystem(true);
    expect(useThemeStore.getState().theme).toBe("light");
    expect(env.root.dataset.theme).toBe("light");
  });

  it("stops following the system once a theme is picked", () => {
    useThemeStore.getState().setPreference("dark");
    env.switchSystem(true);
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(env.root.dataset.theme).toBe("dark");
  });

  it("takes the current system theme when System is picked again", () => {
    useThemeStore.getState().setPreference("dark");
    env.system.light = true;
    useThemeStore.getState().setPreference("system");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("switches to the opposite of the shown theme with the shortcut", () => {
    env.switchSystem(true);
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().preference).toBe("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("keeps the preference for the next launch", async () => {
    useThemeStore.getState().setPreference("light");
    expect(env.storage.get("socadb_appearance")).toBe("light");
    vi.resetModules();
    const next = await import("./themeStore");
    expect(next.useThemeStore.getState().preference).toBe("light");
  });

  it("falls back to System on an unknown stored value", async () => {
    env.storage.set("socadb_appearance", "sepia");
    vi.resetModules();
    const next = await import("./themeStore");
    expect(next.useThemeStore.getState().preference).toBe("system");
  });
});
