import type { Table } from "../types/schema";
import { typeLabel } from "./columnTypes";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Rect = Point & Size;

export const TABLE_GAP = 40;
const MIN_WIDTH = 220;
const HEADER_HEIGHT = 50;
const ROW_HEIGHT = 30;
const INDEXES_HEIGHT = 28;

export function estimateTableSize(
  table: Pick<Table, "name" | "columns" | "indexes">,
): Size {
  const header = 64 + table.name.length * 8;
  const rows = table.columns.map(
    (c) => 90 + c.name.length * 7.2 + typeLabel(c).length * 6.6,
  );
  return {
    width: Math.ceil(Math.max(MIN_WIDTH, header, ...rows)),
    height:
      HEADER_HEIGHT +
      table.columns.length * ROW_HEIGHT +
      (table.indexes?.length ? INDEXES_HEIGHT : 0),
  };
}

function overlaps(r: Rect, x: number, y: number, size: Size) {
  return (
    x < r.x + r.width + TABLE_GAP &&
    x + size.width + TABLE_GAP > r.x &&
    y < r.y + r.height + TABLE_GAP &&
    y + size.height + TABLE_GAP > r.y
  );
}

const MAX_CANDIDATES = 20_000;

function positionsWithin(values: number[], origin: number, reach: number) {
  return [...new Set(values)].filter((v) => Math.abs(v - origin) <= reach);
}

function sidesOf(group: readonly Rect[], target: Point, size: Size): Point[] {
  const left = Math.min(...group.map((r) => r.x));
  const right = Math.max(...group.map((r) => r.x + r.width));
  const top = Math.min(...group.map((r) => r.y));
  const bottom = Math.max(...group.map((r) => r.y + r.height));
  return [
    { x: right + TABLE_GAP, y: target.y },
    { x: left - TABLE_GAP - size.width, y: target.y },
    { x: target.x, y: bottom + TABLE_GAP },
    { x: target.x, y: top - TABLE_GAP - size.height },
  ];
}

function besideCluster(
  near: readonly Rect[],
  occupied: readonly Rect[],
  target: Point,
  size: Size,
): Point {
  const distance = (p: Point) => Math.hypot(p.x - target.x, p.y - target.y);
  const byDistance = (a: Point, b: Point) => distance(a) - distance(b);
  const spot =
    sidesOf(near, target, size)
      .sort(byDistance)
      .find((p) => !occupied.some((r) => overlaps(r, p.x, p.y, size))) ??
    sidesOf(occupied, target, size).sort(byDistance)[0];
  return { x: Math.round(spot.x), y: Math.round(spot.y) };
}

// On each axis the nearest free spot sits on the target or against a table
// edge, so only those positions are tried; the search widens until one is free.
// In a crowded area it settles for the nearest free side of the tables around
// the target, which costs nothing, instead of trying tens of thousands of spots.
export function nearestFreeSpot(
  occupied: readonly Rect[],
  target: Point,
  size: Size,
): Point {
  for (let reach = 2 * Math.max(size.width, size.height, TABLE_GAP); ; reach *= 2) {
    const near = occupied.filter(
      (r) =>
        r.x < target.x + size.width + reach + TABLE_GAP &&
        r.x + r.width > target.x - reach - TABLE_GAP &&
        r.y < target.y + size.height + reach + TABLE_GAP &&
        r.y + r.height > target.y - reach - TABLE_GAP,
    );
    const xs = positionsWithin(
      [
        target.x,
        ...near.flatMap((r) => [r.x + r.width + TABLE_GAP, r.x - TABLE_GAP - size.width]),
      ],
      target.x,
      reach,
    );
    const ys = positionsWithin(
      [
        target.y,
        ...near.flatMap((r) => [
          r.y + r.height + TABLE_GAP,
          r.y - TABLE_GAP - size.height,
        ]),
      ],
      target.y,
      reach,
    );
    if (xs.length * ys.length > MAX_CANDIDATES || !Number.isFinite(reach)) {
      return besideCluster(near, occupied, target, size);
    }
    const candidates = xs
      .flatMap((x) => ys.map((y) => ({ x, y, dx: x - target.x, dy: y - target.y })))
      .map((c) => ({ ...c, distance: Math.hypot(c.dx, c.dy) }))
      .filter((c) => c.distance <= reach)
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          Math.abs(a.dy) - Math.abs(b.dy) ||
          b.dx - a.dx ||
          b.dy - a.dy,
      );
    const free = candidates.find((c) => !near.some((r) => overlaps(r, c.x, c.y, size)));
    if (free) return { x: Math.round(free.x), y: Math.round(free.y) };
  }
}

export function centreToReveal(rect: Rect, visible: Rect, canvasCentre: Point): Point {
  return {
    x: rect.x + rect.width / 2 - (visible.x + visible.width / 2 - canvasCentre.x),
    y: rect.y + rect.height / 2 - (visible.y + visible.height / 2 - canvasCentre.y),
  };
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function placeNewTable(
  tables: readonly Table[],
  size: Size,
  view: { area: Rect; blocked: readonly Rect[]; sizeOf: (table: Table) => Size } | null,
): Point {
  const sizeOf = view?.sizeOf ?? estimateTableSize;
  const placed = tables.map((t) => ({ ...t.position, ...sizeOf(t) }));
  const { area } = view ?? {};
  if (view && area && [area.x, area.y, area.width, area.height].every(Number.isFinite)) {
    return nearestFreeSpot(
      [...placed, ...view.blocked],
      {
        x: area.x + (area.width - size.width) / 2,
        y: area.y + (area.height - size.height) / 2,
      },
      size,
    );
  }
  if (placed.length === 0) return { x: 100, y: 100 };
  return nearestFreeSpot(
    placed,
    {
      x: Math.max(...placed.map((r) => r.x + r.width)) + 2 * TABLE_GAP,
      y: Math.min(...placed.map((r) => r.y)),
    },
    size,
  );
}
