import type { TableColor, Table } from "../types/schema";

export const TABLE_COLORS: TableColor[] = [
  "rose",
  "amber",
  "emerald",
  "sky",
  "violet",
  "teal",
  "orange",
  "fuchsia",
];

export const TABLE_COLOR_MAP: Record<
  TableColor,
  { bg: string; border: string; dot: string }
> = {
  rose: { bg: "#FFF1F2", border: "#FECDD3", dot: "#E11D48" },
  amber: { bg: "#FFFBEB", border: "#FDE68A", dot: "#D97706" },
  emerald: { bg: "#ECFDF5", border: "#A7F3D0", dot: "#059669" },
  sky: { bg: "#F0F9FF", border: "#BAE6FD", dot: "#0284C7" },
  violet: { bg: "#F5F3FF", border: "#DDD6FE", dot: "#7C3AED" },
  teal: { bg: "#F0FDFA", border: "#99F6E4", dot: "#0D9488" },
  orange: { bg: "#FFF7ED", border: "#FED7AA", dot: "#EA580C" },
  fuchsia: { bg: "#FDF4FF", border: "#F5D0FE", dot: "#C026D3" },
};

export function getNextTableColor(existingTables: Table[]): TableColor {
  const usedColors = new Set(
    existingTables.map((t) => t.color).filter((c): c is TableColor => c !== undefined),
  );

  for (const color of TABLE_COLORS) {
    if (!usedColors.has(color)) return color;
  }

  return TABLE_COLORS[existingTables.length % TABLE_COLORS.length];
}
