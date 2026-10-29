import { describe, it, expect, vi, afterAll } from "vitest";

const env = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const system = { light: false };
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      get matches() {
        return system.light;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    }),
  });
  vi.stubGlobal("document", { documentElement: { dataset: {}, style: {} } });
  return {
    switchSystem(light: boolean) {
      system.light = light;
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async () => JSON.stringify({ theme: "light" })),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./socadbDir", () => ({
  socadbConfigPath: vi.fn(async () => "/home/.socadb/config.json"),
  readConfigForUpdate: vi.fn(async () => ({ theme: "light", language: "fr" })),
  queueConfigWrite: vi.fn(async (write: () => Promise<void>) => write()),
}));

import { invoke } from "@tauri-apps/api/core";
import { followSystemTheme, useThemeStore } from "../stores/themeStore";
import { initThemePersistence } from "./themePersistence";

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("theme persistence", () => {
  it("saves only a picked preference", async () => {
    followSystemTheme();
    initThemePersistence();
    await vi.waitFor(() => expect(useThemeStore.getState().preference).toBe("light"));
    expect(invoke).not.toHaveBeenCalled();

    useThemeStore.getState().setPreference("system");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    expect(invoke).toHaveBeenCalledWith("atomic_write", {
      path: "/home/.socadb/config.json",
      content: JSON.stringify({ theme: "system", language: "fr" }),
    });

    env.switchSystem(true);
    expect(useThemeStore.getState().theme).toBe("light");
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledOnce();
  });
});
