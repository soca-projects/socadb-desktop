import type { Table } from "../types/schema";

export const PRESET_COLORS = [
  "#E11D48",
  "#D97706",
  "#059669",
  "#0284C7",
  "#7C3AED",
  "#0D9488",
  "#EA580C",
  "#C026D3",
];

const LEGACY_COLOR_MAP: Record<string, string> = {
  rose: "#E11D48",
  amber: "#D97706",
  emerald: "#059669",
  sky: "#0284C7",
  violet: "#7C3AED",
  teal: "#0D9488",
  orange: "#EA580C",
  fuchsia: "#C026D3",
};

export function normalizeTableColor(color: string): string {
  return LEGACY_COLOR_MAP[color] ?? color;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function blendWithWhite(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    Math.round(r + (255 - r) * factor),
    Math.round(g + (255 - g) * factor),
    Math.round(b + (255 - b) * factor),
  );
}

export function getColorVariants(color: string): { bg: string; border: string; dot: string } {
  const hex = normalizeTableColor(color);
  return {
    bg: blendWithWhite(hex, 0.72),
    border: blendWithWhite(hex, 0.55),
    dot: hex,
  };
}

export function getNextTableColor(existingTables: Table[]): string {
  const usedColors = new Set(
    existingTables
      .map((t) => t.color)
      .filter((c): c is string => c !== undefined)
      .map(normalizeTableColor),
  );

  for (const color of PRESET_COLORS) {
    if (!usedColors.has(color)) return color;
  }

  return PRESET_COLORS[existingTables.length % PRESET_COLORS.length];
}
