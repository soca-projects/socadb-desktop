import ELK from "elkjs/lib/elk.bundled.js";
import type { Table, Relation } from "../types/schema";

const elk = new ELK();

const NODE_WIDTH = 250;
const ROW_HEIGHT = 28; // matches py-1.5 (12px) + text line-height (16px) in ColumnRow
const HEADER_HEIGHT = 36; // matches py-2.5 (20px) + text line-height (16px) in TableItem header
const PADDING = 16; // bottom padding + "Add column" button area

function estimateNodeHeight(table: Table): number {
  return HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + PADDING;
}

export async function computeAutoLayout(
  tables: Table[],
  relations: Relation[],
): Promise<Record<string, { x: number; y: number }>> {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    },
    children: tables.map((table) => ({
      id: table.id,
      width: NODE_WIDTH,
      height: estimateNodeHeight(table),
    })),
    edges: relations.map((rel) => ({
      id: rel.id,
      sources: [rel.from.tableId],
      targets: [rel.to.tableId],
    })),
  };

  const layout = await elk.layout(graph);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of layout.children ?? []) {
    positions[node.id] = { x: node.x ?? 0, y: node.y ?? 0 };
  }

  return positions;
}
