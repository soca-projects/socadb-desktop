import type { Schema, Table } from "../types/schema";

// TableNode's rendered sizes, so a miniature looks like the canvas.
export const PREVIEW_METRICS = {
  header: 40,
  row: 30,
  padding: 4,
  minWidth: 220,
  sidePadding: 14,
} as const;

const HEADER_CHAR = 7.8;
const NAME_CHAR = 7.2;
const TYPE_CHAR = 6.6;
const MARGIN = 40;
const ASPECT = 16 / 10;
const DETOUR = 20;

export interface PreviewColumn {
  id: string;
  name: string;
  type: string;
  y: number;
  key: "primary" | "foreign" | null;
}

export interface PreviewTable {
  id: string;
  name: string;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  headerPath: string;
  columns: PreviewColumn[];
}

export interface PreviewModel {
  viewBox: string;
  tables: PreviewTable[];
  edges: string[];
}

export function tableWidth(table: Table): number {
  const { sidePadding, minWidth } = PREVIEW_METRICS;
  const header = 2 * sidePadding + 14 + 8 + table.name.length * HEADER_CHAR;
  const rows = table.columns.map(
    (c) =>
      2 * sidePadding +
      16 +
      8 +
      c.name.length * NAME_CHAR +
      12 +
      c.type.length * TYPE_CHAR +
      16,
  );
  return Math.ceil(Math.max(minWidth, header, ...rows));
}

export function tableHeight(table: Table): number {
  const { header, row, padding } = PREVIEW_METRICS;
  return header + 2 * padding + table.columns.length * row;
}

function headerPath(x: number, y: number, width: number): string {
  const r = 8;
  const h = PREVIEW_METRICS.header;
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${y + h}Z`;
}

function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  if (tx - sx >= 2 * DETOUR) {
    const mx = (sx + tx) / 2;
    return `M${sx},${sy}H${mx}V${ty}H${tx}`;
  }
  const my = (sy + ty) / 2;
  return `M${sx},${sy}H${sx + DETOUR}V${my}H${tx - DETOUR}V${ty}H${tx}`;
}

const round = (n: number) => Math.round(n * 10) / 10;

function fitViewBox(tables: PreviewTable[]): string {
  if (tables.length === 0) return "0 0 160 100";
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tables) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }
  minX -= MARGIN;
  minY -= MARGIN;
  let width = maxX - minX + MARGIN;
  let height = maxY - minY + MARGIN;
  if (width / height > ASPECT) {
    const fitted = width / ASPECT;
    minY -= (fitted - height) / 2;
    height = fitted;
  } else {
    const fitted = height * ASPECT;
    minX -= (fitted - width) / 2;
    width = fitted;
  }
  return `${round(minX)} ${round(minY)} ${round(width)} ${round(height)}`;
}

export function buildPreview(schema: Schema): PreviewModel {
  const { header, row, padding } = PREVIEW_METRICS;
  const tables: PreviewTable[] = schema.tables.map((table) => {
    const width = tableWidth(table);
    const { x, y } = table.position;
    return {
      id: table.id,
      name: table.name,
      color: table.color ?? null,
      x,
      y,
      width,
      height: tableHeight(table),
      headerPath: headerPath(x, y, width),
      columns: table.columns.map((c, i) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        y: y + header + padding + i * row + row / 2,
        key: c.isPrimaryKey ? "primary" : c.isForeignKey ? "foreign" : null,
      })),
    };
  });
  const byId = new Map(tables.map((t) => [t.id, t]));
  const edges: string[] = [];
  for (const relation of schema.relations) {
    const from = byId.get(relation.from.tableId);
    const to = byId.get(relation.to.tableId);
    const fromColumn = from?.columns.find((c) => c.id === relation.from.columnId);
    const toColumn = to?.columns.find((c) => c.id === relation.to.columnId);
    if (!from || !to || !fromColumn || !toColumn) continue;
    edges.push(edgePath(from.x + from.width, fromColumn.y, to.x, toColumn.y));
  }
  return { viewBox: fitViewBox(tables), tables, edges };
}
