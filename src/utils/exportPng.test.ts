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
  useSchemaStore: { getState: vi.fn() },
}));

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { toBlob } from "html-to-image";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import { setCanvasView } from "./canvasView";
import { logError, logWarn } from "./log";
import { exportCanvasPng } from "./exportPng";

const stateWith = (name: string) =>
  ({ schema: { name } }) as ReturnType<typeof useSchemaStore.getState>;
const shop = stateWith("shop");

describe("exportCanvasPng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", { querySelector: () => ({ isConnected: true }) });
    vi.mocked(useSchemaStore.getState).mockReturnValue(shop);
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

  it("doesn't render anything when the dialog is cancelled", async () => {
    vi.mocked(save).mockResolvedValue(null);
    await exportCanvasPng();
    expect(toBlob).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("writes nothing and says so when the schema changes behind the dialog", async () => {
    vi.mocked(save).mockImplementation(() => {
      vi.mocked(useSchemaStore.getState).mockReturnValue(stateWith("other"));
      return Promise.resolve("/tmp/shop.png");
    });
    await exportCanvasPng();
    expect(toBlob).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("toast.exportCanvasChanged");
  });

  it("writes nothing and says so when the canvas closes behind the dialog", async () => {
    vi.stubGlobal("document", { querySelector: () => ({ isConnected: false }) });
    await exportCanvasPng();
    expect(toBlob).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("toast.exportCanvasChanged");
    expect(logWarn).toHaveBeenCalledWith("export.canvas_changed", expect.any(String));
    expect(logError).not.toHaveBeenCalled();
  });
});
