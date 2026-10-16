import { describe, it, expect } from "vitest";
import {
  colorTables,
  normalizeTableColor,
  getNextTableColor,
  getColorVariants,
  PRESET_COLORS,
} from "./tableColors";
import type { Table } from "../types/schema";

function makeTable(color?: string): Table {
  return {
    id: "t1",
    name: "test",
    color,
    position: { x: 0, y: 0 },
    columns: [],
  };
}

describe("normalizeTableColor", () => {
  it("maps legacy color names to hex", () => {
    expect(normalizeTableColor("rose")).toBe("#E11D48");
    expect(normalizeTableColor("emerald")).toBe("#059669");
  });

  it("returns hex values as-is", () => {
    expect(normalizeTableColor("#FF0000")).toBe("#FF0000");
  });
});

describe("getNextTableColor", () => {
  it("returns the first preset color when no tables exist", () => {
    expect(getNextTableColor([])).toBe(PRESET_COLORS[0]);
  });

  it("returns an unused color", () => {
    const tables = [makeTable(PRESET_COLORS[0])];
    expect(getNextTableColor(tables)).toBe(PRESET_COLORS[1]);
  });

  it("cycles when all colors are used", () => {
    const tables = PRESET_COLORS.map((c) => makeTable(c));
    const result = getNextTableColor(tables);
    expect(PRESET_COLORS).toContain(result);
  });
});

describe("getColorVariants", () => {
  it("returns bg, border, and dot for a hex color", () => {
    const variants = getColorVariants("#E11D48");
    expect(variants.bg).toMatch(/^#[A-F0-9]{6}$/);
    expect(variants.border).toMatch(/^#[A-F0-9]{6}$/);
    expect(variants.dot).toBe("#E11D48");
  });

  it("normalizes legacy color names", () => {
    const variants = getColorVariants("rose");
    expect(variants.dot).toBe("#E11D48");
  });
});

describe("colorTables", () => {
  it("keeps a table's color and gives the others free ones", () => {
    const [a, b] = colorTables([makeTable("#3498DB"), makeTable()]);
    expect(a.color).toBe("#3498DB");
    expect(b.color).toBe(PRESET_COLORS[0]);
  });

  it("avoids colors already used in the schema", () => {
    const [b] = colorTables([makeTable()], [makeTable(PRESET_COLORS[0])]);
    expect(b.color).toBe(PRESET_COLORS[1]);
  });
});
