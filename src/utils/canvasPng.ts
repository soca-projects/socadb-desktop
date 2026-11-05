import { getFontEmbedCSS, toSvg } from "html-to-image";
import { useSchemaStore } from "../stores/schemaStore";
import { useThemeStore } from "../stores/themeStore";
import { CanvasChangedError, canvasImageOptions } from "./canvasImage";

const PIXEL_RATIO = 2;
// WebKit refuses an image's data URL past about 64 MB, about 5800 elements here
// since each one carries its whole computed style: hence the passes.
const MAX_ELEMENTS_PER_PASS = 2000;
const LAYER_ITEMS =
  ".react-flow__edges > svg, .react-flow__edgelabel-renderer > div, .react-flow__nodes > .react-flow__node";

export function groupIntoPasses<T>(
  items: readonly T[],
  sizeOf: (item: T) => number,
  max: number,
): T[][] {
  const passes: T[][] = [[]];
  let size = 0;
  for (const item of items) {
    const itemSize = sizeOf(item);
    const current = passes[passes.length - 1];
    if (current && current.length > 0 && size + itemSize > max) {
      passes.push([item]);
      size = itemSize;
    } else {
      current?.push(item);
      size += itemSize;
    }
  }
  return passes;
}

export function inPaintOrder<T>(items: readonly T[], zIndexOf: (item: T) => number): T[] {
  const zIndexes = new Map(items.map((item) => [item, zIndexOf(item)]));
  return [...items].sort((a, b) => (zIndexes.get(a) ?? 0) - (zIndexes.get(b) ?? 0));
}

export function inPass<T>(items: ReadonlySet<T>, pass: ReadonlySet<T>, node: T): boolean {
  return !items.has(node) || pass.has(node);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      image
        .decode()
        .then(() => resolve(image))
        .catch(reject);
    };
    image.onerror = () => reject(new Error("The browser refused the rendered image"));
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = url;
  });
}

export async function renderCanvasPng(
  viewport: HTMLElement,
  backgroundColor: string,
): Promise<Blob | null> {
  const { schema } = useSchemaStore.getState();
  const { theme } = useThemeStore.getState();
  const options = canvasImageOptions();
  const width = options.width ?? viewport.clientWidth;
  const height = options.height ?? viewport.clientHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * PIXEL_RATIO;
  canvas.height = height * PIXEL_RATIO;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // A later pass covers an earlier one whatever their z-index.
  const items = inPaintOrder([...viewport.querySelectorAll(LAYER_ITEMS)], (item) => {
    return Number.parseInt(getComputedStyle(item).zIndex, 10) || 0;
  });
  const allItems = new Set<unknown>(items);
  const fontEmbedCSS = await getFontEmbedCSS(viewport);
  for (const pass of groupIntoPasses(
    items,
    (item) => item.querySelectorAll("*").length + 1,
    MAX_ELEMENTS_PER_PASS,
  )) {
    if (
      !viewport.isConnected ||
      useSchemaStore.getState().schema !== schema ||
      useThemeStore.getState().theme !== theme
    ) {
      throw new CanvasChangedError();
    }
    const inThisPass = new Set<unknown>(pass);
    const url = await toSvg(viewport, {
      ...options,
      fontEmbedCSS,
      filter: (node) => inPass(allItems, inThisPass, node),
    });
    const image = await loadImage(url);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  return new Promise((resolve) => canvas.toBlob(resolve));
}
