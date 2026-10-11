import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));

import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { flushSuppressed, logError, logWarn } from "./log";

const CallZ = z.tuple([
  z.literal("plugin:log|log"),
  z.object({ level: z.number(), message: z.string() }),
]);

const LineZ = z.object({
  area: z.string(),
  code: z.string(),
  msg: z.string(),
  ctx: z.record(z.string(), z.unknown()).optional(),
});

function written(level: number) {
  return vi
    .mocked(invoke)
    .mock.calls.map((call) => CallZ.parse(call))
    .filter(([, args]) => args.level === level)
    .map(([, args]) => LineZ.parse(JSON.parse(args.message)));
}

const errors = () => written(5);
const warnings = () => written(4);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("log", () => {
  it("writes one coded JSON payload with the error's stack", () => {
    logError("ui.uncaught", new Error("disk full"), { source: "App.tsx" });
    const payload = errors()[0];
    expect(payload).toMatchObject({
      area: "ui",
      code: "ui.uncaught",
      msg: "disk full",
      ctx: { source: "App.tsx" },
    });
    expect(payload.ctx?.stack).toContain("log.test.ts");
    expect(payload.ctx?.stack).not.toContain("disk full");
  });

  it("caps a flood of one code, then reports how many lines it dropped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 12, 0));
    for (let i = 0; i < 25; i++) logError("ui.unhandled_rejection", new Error("loop"));
    expect(errors()).toHaveLength(20);
    expect(warnings()[0]).toMatchObject({
      code: "log.suppressing",
      ctx: { code: "ui.unhandled_rejection" },
    });
    vi.setSystemTime(new Date(2026, 9, 11, 12, 1, 1));
    logError("ui.unhandled_rejection", new Error("loop"));
    const summary = warnings()[1];
    expect(summary).toMatchObject({
      code: "log.suppressed",
      ctx: { code: "ui.unhandled_rejection", dropped: 5 },
    });
    expect(errors()).toHaveLength(21);
  });

  it("reports dropped lines when the page goes away, before the window ends", () => {
    for (let i = 0; i < 23; i++) logError("ui.render_crash", new Error("loop"));
    flushSuppressed();
    const summary = warnings()[1];
    expect(summary).toMatchObject({
      code: "log.suppressed",
      ctx: { code: "ui.render_crash", dropped: 3 },
    });
    flushSuppressed();
    expect(warnings()).toHaveLength(2);
  });

  it("never copies a parser's quote of the input, nor V8's message line in the stack", () => {
    let parseError: unknown;
    try {
      JSON.parse('{"table": patients_hiv}');
    } catch (e) {
      parseError = e;
    }
    logError("import.failed", parseError);
    const parsed = errors()[0];
    expect(parsed.msg).toBe("Invalid JSON");
    expect(parsed.ctx).toBeUndefined();

    const failure = new Error('Table "patients_hiv" already exists');
    failure.stack =
      'Error: Table "patients_hiv" already exists\n    at create (App.tsx:1:1)';
    logError("mcp.request.failed", failure);
    const logged = errors()[1];
    expect(logged.msg).toBe('Table "…" already exists');
    expect(logged.ctx?.stack).toBe("    at create (App.tsx:1:1)");
  });

  it("sums up a validation error on one line", () => {
    const result = z
      .object({ files: z.array(z.object({ path: z.string() })) })
      .safeParse({
        files: [{ path: 42 }],
      });
    if (result.success) throw new Error("expected a failure");
    logWarn("recent.load.invalid", result.error);
    const payload = warnings()[0];
    expect(payload.msg).toBe(
      "files.0.path: Invalid input: expected string, received number",
    );
  });

  it("accepts plain values and never throws when the bridge is gone", () => {
    vi.mocked(invoke).mockReturnValueOnce(Promise.reject(new Error("no bridge")));
    expect(() => logWarn("view.change", "editor")).not.toThrow();
    expect(warnings()[0]).toEqual({
      area: "view",
      code: "view.change",
      msg: "editor",
    });
  });
});
