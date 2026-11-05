import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./exportPng", () => ({ exportCanvasPng: vi.fn() }));
vi.mock("./exportSvg", () => ({ exportCanvasSvg: vi.fn() }));
vi.mock("./modalStack", () => ({ focusTopModal: vi.fn() }));

import { exportImageUnderModal } from "./exportImage";
import { exportCanvasPng } from "./exportPng";
import { exportCanvasSvg } from "./exportSvg";
import { focusTopModal } from "./modalStack";

describe("exportImageUnderModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exportCanvasPng).mockResolvedValue();
    vi.mocked(exportCanvasSvg).mockResolvedValue();
  });

  it("moves the focus to the overlay before the content goes inert", async () => {
    const calls: string[] = [];
    vi.mocked(focusTopModal).mockImplementation(() => calls.push("focus"));
    await exportImageUnderModal("png", () => calls.push("busy"));
    expect(calls).toEqual(["focus", "busy"]);
  });

  it("runs the chosen format only", async () => {
    await exportImageUnderModal("svg", vi.fn());
    expect(exportCanvasSvg).toHaveBeenCalledTimes(1);
    expect(exportCanvasPng).not.toHaveBeenCalled();
  });

  it("only settles once the export has ended", async () => {
    let finish: () => void = vi.fn();
    vi.mocked(exportCanvasPng).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const done = vi.fn();
    const running = exportImageUnderModal("png", vi.fn()).then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    finish();
    await running;
    expect(done).toHaveBeenCalledTimes(1);
  });
});
