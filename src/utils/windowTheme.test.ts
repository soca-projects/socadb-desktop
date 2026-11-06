import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme }),
}));
vi.mock("../stores/themeStore", () => ({
  useThemeStore: {
    getState: () => ({ preference: preference.value }),
    subscribe: vi.fn(),
  },
}));
vi.mock("./log", () => ({ logWarn: vi.fn() }));
vi.mock("./platform", () => ({
  get IS_LINUX() {
    return linux.value;
  },
}));

const { setTheme, preference, calls, linux } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    linux: { value: false },
    preference: { value: "system" },
    setTheme: vi.fn((theme: string | null) => {
      calls.push(`setTheme ${theme}`);
      return Promise.resolve();
    }),
  };
});

import { attachWindowMenu } from "./windowTheme";

const menu = {
  setAsWindowMenu: vi.fn(() => {
    calls.push("attach");
    return Promise.resolve(undefined);
  }),
};

describe("attachWindowMenu", () => {
  beforeEach(() => {
    calls.length = 0;
    linux.value = false;
  });

  it("hands the menu bar back to the system theme once attached", async () => {
    preference.value = "system";
    await attachWindowMenu(menu);
    expect(calls).toEqual(["attach", "setTheme null"]);
  });

  it("keeps a theme the user picked", async () => {
    preference.value = "dark";
    await attachWindowMenu(menu);
    expect(calls).toEqual(["attach", "setTheme dark"]);
  });

  it("leaves the window theme alone on Linux", async () => {
    linux.value = true;
    await attachWindowMenu(menu);
    expect(calls).toEqual(["attach"]);
  });
});
