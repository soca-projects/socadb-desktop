import { describe, expect, it } from "vitest";
import type { Column, Table } from "../types/schema";
import {
  centreToReveal,
  containsRect,
  estimateTableSize,
  nearestFreeSpot,
  placeNewTable,
  TABLE_GAP,
  type Rect,
} from "./tablePlacement";

const column = (name: string): Column => ({
  id: name,
  name,
  type: "integer",
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: false,
  isUnique: false,
  isAutoIncrement: false,
  defaultValue: null,
});

const size = { width: 240, height: 120 };
const target = { x: 480, y: 340 };

describe("nearestFreeSpot", () => {
  it("keeps the target when nothing is there", () => {
    expect(nearestFreeSpot([], target, size)).toEqual(target);
  });

  it("takes the closest side of a table that covers the target", () => {
    const wide = { x: 450, y: 300, width: 300, height: 200 };

    expect(nearestFreeSpot([wide], target, size)).toEqual({
      x: 480,
      y: 500 + TABLE_GAP,
    });
  });

  it("gathers tables created one after the other around the target", () => {
    const placed: Rect[] = [];
    for (let i = 0; i < 4; i++) {
      placed.push({ ...nearestFreeSpot(placed, target, size), ...size });
    }

    expect(placed.map(({ x, y }) => [x, y])).toEqual([
      [480, 340],
      [480, 500],
      [480, 180],
      [760, 340],
    ]);
  });

  it("finds a spot past a crowd of tables", () => {
    const crowd: Rect[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        crowd.push({ x: col * 300, y: row * 200, width: 260, height: 160 });
      }
    }
    const spot = nearestFreeSpot(crowd, { x: 1400, y: 900 }, size);

    expect(
      crowd.some(
        (r) =>
          spot.x < r.x + r.width &&
          spot.x + 240 > r.x &&
          spot.y < r.y + r.height &&
          spot.y + 120 > r.y,
      ),
    ).toBe(false);
  });
});

describe("nearestFreeSpot in a crowded schema", () => {
  it("settles for a side of the whole schema, on the target's row or column", () => {
    const crowd: Rect[] = [];
    for (let i = 0; i < 1600; i++) {
      crowd.push({
        x: (i % 40) * 300 + (i % 7) * 3,
        y: Math.floor(i / 40) * 280 + (i % 5) * 4,
        width: 240 + (i % 3) * 5,
        height: 200 + (i % 4) * 5,
      });
    }
    const middle = { x: 6000, y: 5600 };
    const spot = nearestFreeSpot(crowd, middle, size);
    const box = {
      left: Math.min(...crowd.map((r) => r.x)),
      right: Math.max(...crowd.map((r) => r.x + r.width)),
      top: Math.min(...crowd.map((r) => r.y)),
      bottom: Math.max(...crowd.map((r) => r.y + r.height)),
    };

    expect(spot.x === middle.x || spot.y === middle.y).toBe(true);
    expect(
      spot.x >= box.right ||
        spot.x + size.width <= box.left ||
        spot.y >= box.bottom ||
        spot.y + size.height <= box.top,
    ).toBe(true);
  });
});

describe("nearestFreeSpot next to a dense cluster", () => {
  it("stays by the cluster when other tables sit far away", () => {
    const crowd: Rect[] = [];
    for (let i = 0; i < 100; i++) {
      crowd.push({
        x: (i % 10) * 290 + (i % 7) * 3,
        y: Math.floor(i / 10) * 250 + (i % 5) * 4,
        width: 240 + (i % 3) * 5,
        height: 200 + (i % 4) * 5,
      });
    }
    crowd.push({ x: -8000, y: -6000, width: 240, height: 200 });
    crowd.push({ x: 12000, y: 9000, width: 240, height: 200 });
    const middle = { x: 1450, y: 1250 };
    const spot = nearestFreeSpot(crowd, middle, size);

    expect(Math.hypot(spot.x - middle.x, spot.y - middle.y)).toBeLessThan(2000);
    expect(
      crowd.some(
        (r) =>
          spot.x < r.x + r.width &&
          spot.x + size.width > r.x &&
          spot.y < r.y + r.height &&
          spot.y + size.height > r.y,
      ),
    ).toBe(false);
  });

  it("still finds a spot for a table with no size", () => {
    const taken = { x: 0, y: 0, width: 100, height: 100 };

    expect(
      nearestFreeSpot([taken], { x: 10, y: 10 }, { width: 0, height: 0 }),
    ).toBeDefined();
  });
});

describe("centreToReveal", () => {
  it("brings the table to the middle of what is visible, not of the whole canvas", () => {
    const visible = { x: 0, y: 0, width: 600, height: 800 };
    const canvasCentre = { x: 500, y: 400 };
    const table = { x: 2000, y: 1000, width: 240, height: 120 };

    expect(centreToReveal(table, visible, canvasCentre)).toEqual({ x: 2320, y: 1060 });
  });
});

describe("containsRect", () => {
  const view = { x: 0, y: 0, width: 1200, height: 800 };

  it("tells whether a table is fully on screen", () => {
    expect(containsRect(view, { x: 100, y: 100, ...size })).toBe(true);
    expect(containsRect(view, { x: 1000, y: 100, ...size })).toBe(false);
    expect(containsRect(view, { x: 100, y: -20, ...size })).toBe(false);
  });
});

describe("estimateTableSize", () => {
  it("grows with the columns and never goes below the minimum width", () => {
    const small = estimateTableSize({ name: "t", columns: [column("id")] });
    const tall = estimateTableSize({
      name: "t",
      columns: [column("id"), column("a_much_longer_column_name_than_usual")],
    });

    expect(small.width).toBe(220);
    expect(tall.width).toBeGreaterThan(220);
    expect(tall.height).toBeGreaterThan(small.height);
  });
});

describe("placeNewTable", () => {
  const table = (id: string, x: number, y: number): Table => ({
    id,
    name: id,
    position: { x, y },
    columns: [column("id")],
  });
  const view: Rect = { x: 0, y: 0, width: 1200, height: 800 };

  it("centres the table in what the canvas shows", () => {
    expect(
      placeNewTable([], size, { area: view, blocked: [], sizeOf: estimateTableSize }),
    ).toEqual(target);
  });

  it("keeps clear of the chat", () => {
    const chat = { x: 400, y: 200, width: 800, height: 600 };
    const spot = placeNewTable([], size, {
      area: view,
      blocked: [chat],
      sizeOf: estimateTableSize,
    });

    expect(
      spot.x + size.width + TABLE_GAP <= chat.x ||
        spot.y + size.height + TABLE_GAP <= chat.y,
    ).toBe(true);
  });

  it("sizes the tables on screen with what the canvas measured", () => {
    const measuredWide = () => ({ width: 500, height: 120 });
    const spot = placeNewTable([table("wide", 350, 340)], size, {
      area: view,
      blocked: [],
      sizeOf: measuredWide,
    });

    expect(spot).toEqual({ x: 480, y: 340 + 120 + TABLE_GAP });
  });

  it("ignores a view it cannot measure", () => {
    const unmeasured = { x: Number.NaN, y: 0, width: 1200, height: 800 };

    expect(
      placeNewTable([], size, {
        area: unmeasured,
        blocked: [],
        sizeOf: estimateTableSize,
      }),
    ).toEqual({ x: 100, y: 100 });
  });

  it("starts an empty schema at the usual spot when the canvas is not shown", () => {
    expect(placeNewTable([], size, null)).toEqual({ x: 100, y: 100 });
  });

  it("puts the table right of the whole schema when the canvas is not shown", () => {
    const tables = [table("a", 0, 50), table("b", 600, 0)];

    expect(placeNewTable(tables, size, null)).toEqual({ x: 820 + 2 * TABLE_GAP, y: 0 });
  });
});
