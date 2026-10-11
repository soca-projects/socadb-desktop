import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(() => Promise.resolve()),
  warn: vi.fn(() => Promise.resolve()),
  info: vi.fn(() => Promise.resolve()),
  debug: vi.fn(() => Promise.resolve()),
}));

import { error, warn } from "@tauri-apps/plugin-log";
import { logError, logWarn } from "./log";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("log", () => {
  it("writes one coded JSON payload with the error's stack", () => {
    logError("ui.uncaught", new Error("disk full"), { source: "App.tsx" });
    const payload = JSON.parse(vi.mocked(error).mock.calls[0][0]);
    expect(payload).toMatchObject({
      area: "ui",
      code: "ui.uncaught",
      msg: "disk full",
      ctx: { source: "App.tsx" },
    });
    expect(payload.ctx.stack).toContain("disk full");
  });

  it("accepts plain values and never throws when the bridge is gone", () => {
    vi.mocked(warn).mockReturnValueOnce(Promise.reject(new Error("no bridge")));
    expect(() => logWarn("view.change", "editor")).not.toThrow();
    expect(JSON.parse(vi.mocked(warn).mock.calls[0][0])).toEqual({
      area: "view",
      code: "view.change",
      msg: "editor",
    });
  });
});
