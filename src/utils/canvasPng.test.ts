import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("html-to-image", () => ({
  getFontEmbedCSS: vi.fn(() => Promise.resolve("fonts")),
  toSvg: vi.fn(),
}));
vi.mock("../stores/schemaStore", () => ({
  useSchemaStore: { getState: vi.fn() },
}));
vi.mock("../stores/themeStore", () => ({
  useThemeStore: { getState: vi.fn() },
}));

import { toSvg } from "html-to-image";
import { useSchemaStore } from "../stores/schemaStore";
import { useThemeStore } from "../stores/themeStore";
import { CanvasChangedError } from "./canvasImage";
import { groupIntoPasses, inPaintOrder, inPass, renderCanvasPng } from "./canvasPng";
import { setCanvasView } from "./canvasView";

const sizes: Record<string, number> = { a: 3, b: 3, c: 3, big: 50, d: 1 };
const sizeOf = (item: string) => sizes[item] ?? 0;

describe("groupIntoPasses", () => {
  it("keeps everything in one pass when it fits", () => {
    expect(groupIntoPasses(["a", "b"], sizeOf, 10)).toEqual([["a", "b"]]);
  });

  it("starts a new pass at the limit, in order", () => {
    expect(groupIntoPasses(["a", "b", "c", "d"], sizeOf, 6)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("gives an item larger than the limit its own pass", () => {
    expect(groupIntoPasses(["a", "big", "d"], sizeOf, 10)).toEqual([
      ["a"],
      ["big"],
      ["d"],
    ]);
  });

  it("still makes one pass for an empty canvas", () => {
    expect(groupIntoPasses([], sizeOf, 10)).toEqual([[]]);
  });
});

describe("inPaintOrder", () => {
  const zIndexes: Record<string, number> = {
    edge: 0,
    selectedEdge: 1000,
    label: 0,
    table: 0,
  };
  const zIndexOf = (item: string) => zIndexes[item] ?? 0;

  it("keeps the order of equal z-indexes", () => {
    expect(inPaintOrder(["edge", "label", "table"], zIndexOf)).toEqual([
      "edge",
      "label",
      "table",
    ]);
  });

  it("moves a raised item after the ones it covers", () => {
    expect(inPaintOrder(["selectedEdge", "edge", "table"], zIndexOf)).toEqual([
      "edge",
      "table",
      "selectedEdge",
    ]);
  });
});

describe("inPass", () => {
  const items = new Set(["a", "b"]);
  const pass = new Set(["a"]);

  it("keeps the items of this pass", () => {
    expect(inPass(items, pass, "a")).toBe(true);
  });

  it("leaves out the items of other passes", () => {
    expect(inPass(items, pass, "b")).toBe(false);
  });

  it("keeps the layers and the inside of each item", () => {
    expect(inPass(items, pass, "layer")).toBe(true);
  });
});

describe("renderCanvasPng", () => {
  interface FakeItem {
    zIndex: string;
    querySelectorAll: () => unknown[];
  }
  const item = (elements: number, zIndex = "0"): FakeItem => ({
    zIndex,
    querySelectorAll: () => Array.from({ length: elements - 1 }),
  });
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((done: (blob: Blob | null) => void) => done(new Blob(["png"]))),
  };

  function viewportWith(items: FakeItem[]) {
    const viewport = { isConnected: true, querySelectorAll: () => items };
    return { viewport, element: viewport as unknown as HTMLElement };
  }

  function drawnItems(call: number, items: FakeItem[]) {
    const options = vi.mocked(toSvg).mock.calls[call]?.[1];
    return items.filter((candidate) => options?.filter?.(candidate as never));
  }

  class LoadedImage {
    onload: (() => void) | null = null;
    decode = () => Promise.resolve();
    set src(_url: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    canvas.getContext.mockImplementation(() => context);
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal("Image", LoadedImage);
    vi.stubGlobal("getComputedStyle", (element: FakeItem) => ({
      zIndex: element.zIndex,
    }));
    vi.mocked(useSchemaStore.getState).mockReturnValue({
      schema: {},
    } as ReturnType<typeof useSchemaStore.getState>);
    vi.mocked(useThemeStore.getState).mockReturnValue({
      theme: "light",
    } as ReturnType<typeof useThemeStore.getState>);
    vi.mocked(toSvg).mockResolvedValue("data:image/svg+xml,");
    setCanvasView({
      visibleArea: () => null,
      blockedAreas: () => [],
      measuredSize: () => null,
      reveal: vi.fn(),
      contentBounds: () => ({ x: 0, y: 0, width: 920, height: 420 }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCanvasView(null);
  });

  it("frames the whole schema at twice its size, on the background", async () => {
    const { element } = viewportWith([item(10)]);
    const blob = await renderCanvasPng(element, "#FFFCF6");

    expect(blob).toBeInstanceOf(Blob);
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1000);
    expect(context.fillStyle).toBe("#FFFCF6");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2000, 1000);
    expect(toSvg).toHaveBeenCalledWith(
      element,
      expect.objectContaining({
        width: 1000,
        height: 500,
        fontEmbedCSS: "fonts",
        style: expect.objectContaining({ transform: "translate(40px, 40px) scale(1)" }),
      }),
    );
  });

  it("draws each item once, one pass after the other", async () => {
    const items = [item(1500), item(1500)];
    const { element } = viewportWith(items);
    await renderCanvasPng(element, "#FFFCF6");

    expect(toSvg).toHaveBeenCalledTimes(2);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(drawnItems(0, items)).toEqual([items[0]]);
    expect(drawnItems(1, items)).toEqual([items[1]]);
  });

  it("draws a raised item after the ones it covers", async () => {
    const selectedRelation = item(1500, "1000");
    const table = item(1500, "auto");
    const items = [selectedRelation, table];
    const { element } = viewportWith(items);
    await renderCanvasPng(element, "#FFFCF6");

    expect(drawnItems(0, items)).toEqual([table]);
    expect(drawnItems(1, items)).toEqual([selectedRelation]);
  });

  it("stops without an image when the schema changes between passes", async () => {
    const { element } = viewportWith([item(1500), item(1500)]);
    vi.mocked(toSvg).mockImplementationOnce(() => {
      vi.mocked(useSchemaStore.getState).mockReturnValue({
        schema: {},
      } as ReturnType<typeof useSchemaStore.getState>);
      return Promise.resolve("data:image/svg+xml,");
    });

    await expect(renderCanvasPng(element, "#FFFCF6")).rejects.toBeInstanceOf(
      CanvasChangedError,
    );
    expect(toSvg).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("stops without an image when the theme changes between passes", async () => {
    const { element } = viewportWith([item(1500), item(1500)]);
    vi.mocked(toSvg).mockImplementationOnce(() => {
      vi.mocked(useThemeStore.getState).mockReturnValue({
        theme: "dark",
      } as ReturnType<typeof useThemeStore.getState>);
      return Promise.resolve("data:image/svg+xml,");
    });

    await expect(renderCanvasPng(element, "#FFFCF6")).rejects.toBeInstanceOf(
      CanvasChangedError,
    );
    expect(toSvg).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("stops without an image when the canvas leaves the page between passes", async () => {
    const { viewport, element } = viewportWith([item(1500), item(1500)]);
    vi.mocked(toSvg).mockImplementationOnce(() => {
      viewport.isConnected = false;
      return Promise.resolve("data:image/svg+xml,");
    });

    await expect(renderCanvasPng(element, "#FFFCF6")).rejects.toBeInstanceOf(
      CanvasChangedError,
    );
    expect(toSvg).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("reports an image the browser refuses", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const { element } = viewportWith([item(10)]);
    await expect(renderCanvasPng(element, "#FFFCF6")).rejects.toThrow("refused");
  });

  it("gives no image without a drawing context", async () => {
    canvas.getContext.mockImplementation(() => null as never);
    const { element } = viewportWith([item(10)]);
    expect(await renderCanvasPng(element, "#FFFCF6")).toBeNull();
    expect(toSvg).not.toHaveBeenCalled();
  });
});
