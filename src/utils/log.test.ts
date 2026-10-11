import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(() => Promise.resolve()),
  warn: vi.fn(() => Promise.resolve()),
  info: vi.fn(() => Promise.resolve()),
  debug: vi.fn(() => Promise.resolve()),
}));

import { error, warn } from "@tauri-apps/plugin-log";
import { z } from "zod";
import { flushSuppressed, logError, logWarn } from "./log";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
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

  it("caps a flood of one code, then reports how many lines it dropped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 12, 0));
    for (let i = 0; i < 25; i++) logError("ui.unhandled_rejection", new Error("loop"));
    expect(vi.mocked(error)).toHaveBeenCalledTimes(20);
    vi.setSystemTime(new Date(2026, 9, 11, 12, 1, 1));
    logError("ui.unhandled_rejection", new Error("loop"));
    const summary = JSON.parse(vi.mocked(warn).mock.calls[0][0]);
    expect(summary).toMatchObject({
      code: "log.suppressed",
      ctx: { code: "ui.unhandled_rejection", dropped: 5 },
    });
    expect(vi.mocked(error)).toHaveBeenCalledTimes(21);
  });

  it("reports dropped lines when the page goes away, before the window ends", () => {
    for (let i = 0; i < 23; i++) logError("ui.render_crash", new Error("loop"));
    flushSuppressed();
    const summary = JSON.parse(vi.mocked(warn).mock.calls[0][0]);
    expect(summary).toMatchObject({
      code: "log.suppressed",
      ctx: { code: "ui.render_crash", dropped: 3 },
    });
    flushSuppressed();
    expect(vi.mocked(warn)).toHaveBeenCalledTimes(1);
  });

  it("sums up a validation error on one line", () => {
    const result = z
      .object({ files: z.array(z.object({ path: z.string() })) })
      .safeParse({
        files: [{ path: 42 }],
      });
    if (result.success) throw new Error("expected a failure");
    logWarn("recent.load.invalid", result.error);
    const payload = JSON.parse(vi.mocked(warn).mock.calls[0][0]);
    expect(payload.msg).toBe(
      "files.0.path: Invalid input: expected string, received number",
    );
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
