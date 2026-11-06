import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasImageOptions, imageFrame, withSvgBackground } from "./canvasImage";
import { setCanvasView, type CanvasView } from "./canvasView";

function viewWith(contentBounds: CanvasView["contentBounds"]): CanvasView {
  return {
    visibleArea: () => null,
    blockedAreas: () => [],
    measuredSize: () => null,
    reveal: vi.fn(),
    contentBounds,
    fitView: vi.fn(),
  };
}

describe("imageFrame", () => {
  it("frames the whole schema at full size, with a margin", () => {
    expect(imageFrame({ x: 100, y: -50, width: 1000, height: 500 })).toEqual({
      width: 1080,
      height: 580,
      transform: "translate(-60px, 90px) scale(1)",
    });
  });

  it("scales down a schema too large for an image", () => {
    const frame = imageFrame({ x: 0, y: 0, width: 1000, height: 31920 });
    expect(frame.height).toBe(8000);
    expect(frame.width).toBe(270);
    expect(frame.transform).toBe("translate(10px, 10px) scale(0.25)");
  });
});

describe("canvasImageOptions", () => {
  afterEach(() => setCanvasView(null));

  it("sizes the image and the captured element to the schema, whatever the view", () => {
    setCanvasView(viewWith(() => ({ x: 0, y: 0, width: 920, height: 420 })));
    expect(canvasImageOptions()).toEqual({
      width: 1000,
      height: 500,
      style: {
        width: "1000px",
        height: "500px",
        transform: "translate(40px, 40px) scale(1)",
      },
    });
  });

  it("captures the view as it is on an empty canvas", () => {
    setCanvasView(viewWith(() => null));
    expect(canvasImageOptions()).toEqual({});
  });

  it("captures the view as it is without a canvas", () => {
    expect(canvasImageOptions()).toEqual({});
  });
});

describe("withSvgBackground", () => {
  it("paints the background first, behind everything", () => {
    expect(withSvgBackground('<svg width="10" height="20"><g/></svg>', "#fff")).toBe(
      '<svg width="10" height="20"><rect width="100%" height="100%" fill="#fff"/><g/></svg>',
    );
  });
});
