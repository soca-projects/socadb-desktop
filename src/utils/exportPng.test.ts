import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("html-to-image", () => ({ toBlob: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeFile: vi.fn(() => Promise.resolve()) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("../i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("./log", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("../stores/themeStore", () => ({
  useThemeStore: { getState: () => ({ theme: "light" }) },
}));
vi.mock("../stores/schemaStore", () => ({
  useSchemaStore: { getState: () => ({ schema: { name: "shop" } }) },
}));

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { toBlob } from "html-to-image";
import { setCanvasView } from "./canvasView";
import { exportCanvasPng } from "./exportPng";

describe("exportCanvasPng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", { querySelector: () => ({}) });
    vi.mocked(save).mockResolvedValue("/tmp/shop.png");
    vi.mocked(toBlob).mockResolvedValue(new Blob(["png"]));
    setCanvasView({
      visibleArea: () => null,
      blockedAreas: () => [],
      measuredSize: () => null,
      reveal: vi.fn(),
      contentBounds: () => ({ x: 0, y: 0, width: 920, height: 420 }),
    });
  });

  it("captures the whole schema on the paper background, not the current view", async () => {
    await exportCanvasPng();
    expect(toBlob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: 1000,
        height: 500,
        backgroundColor: "#FFFCF6",
        pixelRatio: 2,
      }),
    );
    expect(writeFile).toHaveBeenCalledWith("/tmp/shop.png", expect.any(Uint8Array));
  });
});
