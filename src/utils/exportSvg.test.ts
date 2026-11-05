import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("html-to-image", () => ({ toSvg: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(() => Promise.resolve()),
}));
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
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toSvg } from "html-to-image";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import { setCanvasView } from "./canvasView";
import { exportCanvasSvg } from "./exportSvg";
import { logError, logWarn } from "./log";

const dataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const stateWith = (name: string) =>
  ({ schema: { name } }) as ReturnType<typeof useSchemaStore.getState>;
const shop = stateWith("shop");

describe("exportCanvasSvg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", { querySelector: () => ({ isConnected: true }) });
    vi.mocked(useSchemaStore.getState).mockReturnValue(shop);
    vi.mocked(save).mockResolvedValue("/tmp/shop.svg");
    setCanvasView(null);
  });

  const onPaper = (svg: string) =>
    svg.replace(
      /^<svg[^>]*>/,
      (open) => `${open}<rect width="100%" height="100%" fill="#FFFCF6"/>`,
    );

  it("captures the whole schema, not the current view", async () => {
    setCanvasView({
      visibleArea: () => null,
      blockedAreas: () => [],
      measuredSize: () => null,
      reveal: vi.fn(),
      contentBounds: () => ({ x: 0, y: 0, width: 920, height: 420 }),
    });
    vi.mocked(toSvg).mockResolvedValue(dataUrl("<svg/>"));
    await exportCanvasSvg();
    expect(toSvg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1000, height: 500 }),
    );
    expect(toSvg).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ backgroundColor: expect.anything() }),
    );
  });

  it("writes the SVG itself, not its data URL", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>a, b % c</text></svg>';
    vi.mocked(toSvg).mockResolvedValue(dataUrl(svg));
    await exportCanvasSvg();
    expect(writeTextFile).toHaveBeenCalledWith("/tmp/shop.svg", onPaper(svg));
  });

  it("keeps accented table names", async () => {
    const svg = "<svg><text>clés_étrangères</text></svg>";
    vi.mocked(toSvg).mockResolvedValue(dataUrl(svg));
    await exportCanvasSvg();
    expect(writeTextFile).toHaveBeenCalledWith("/tmp/shop.svg", onPaper(svg));
  });

  it("writes nothing when the save dialog is cancelled", async () => {
    vi.mocked(toSvg).mockResolvedValue(dataUrl("<svg/>"));
    vi.mocked(save).mockResolvedValue(null);
    await exportCanvasSvg();
    expect(toSvg).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it("writes nothing and says so when the schema changes behind the dialog", async () => {
    vi.mocked(save).mockImplementation(() => {
      vi.mocked(useSchemaStore.getState).mockReturnValue(stateWith("other"));
      return Promise.resolve("/tmp/shop.svg");
    });
    await exportCanvasSvg();
    expect(toSvg).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("toast.exportCanvasChanged");
  });

  it("writes nothing and says so when the canvas closes behind the dialog", async () => {
    vi.stubGlobal("document", { querySelector: () => ({ isConnected: false }) });
    await exportCanvasSvg();
    expect(toSvg).not.toHaveBeenCalled();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("toast.exportCanvasChanged");
    expect(logWarn).toHaveBeenCalledWith("export.canvas_changed", expect.any(String));
  });

  it("reports a data URL it can't decode, and writes nothing", async () => {
    vi.mocked(toSvg).mockResolvedValue("data:image/svg+xml;charset=utf-8,%E0%A4%A");
    await exportCanvasSvg();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith("export.svg.failed", expect.anything());
    expect(toast.error).toHaveBeenCalledOnce();
  });
});
