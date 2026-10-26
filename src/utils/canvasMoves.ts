import type { Node, NodeChange } from "@xyflow/react";
import { useSchemaStore } from "../stores/schemaStore";
import type { Schema } from "../types/schema";

export type TablePositions = Record<string, { x: number; y: number }>;

export const NUDGE_MERGE_MS = 1000;

interface NudgeRun {
  ids: string;
  schema: Schema;
  at: number;
}

export interface MoveTracker {
  dragging: boolean;
  run: NudgeRun | null;
}

export function newMoveTracker(): MoveTracker {
  return { dragging: false, run: null };
}

export function finishedMoves(changes: NodeChange[]): TablePositions | null {
  const positions: TablePositions = {};
  let moved = false;
  for (const change of changes) {
    if (change.type === "position" && change.position && change.dragging === false) {
      positions[change.id] = change.position;
      moved = true;
    }
  }
  return moved ? positions : null;
}

export function saveMoves(changes: NodeChange[], tracker: MoveTracker, now: number) {
  if (changes.some((change) => change.type === "position" && change.dragging === true)) {
    tracker.dragging = true;
  }
  const moved = finishedMoves(changes);
  if (!moved) return;
  const nudge = !tracker.dragging;
  tracker.dragging = false;

  const { schema, updateTablePositions } = useSchemaStore.getState();
  const changed: TablePositions = {};
  for (const table of schema.tables) {
    const position = moved[table.id];
    if (
      position &&
      (position.x !== table.position.x || position.y !== table.position.y)
    ) {
      changed[table.id] = position;
    }
  }
  const ids = Object.keys(changed).sort().join(" ");
  if (!ids) return;

  const run = tracker.run;
  const history = useSchemaStore.temporal.getState();
  const sameRun =
    nudge &&
    run !== null &&
    history.futureStates.length === 0 &&
    run.ids === ids &&
    run.schema === schema &&
    now - run.at < NUDGE_MERGE_MS;
  if (sameRun) history.pause();
  try {
    updateTablePositions(changed);
  } finally {
    if (sameRun) history.resume();
  }
  tracker.run = nudge ? { ids, schema: useSchemaStore.getState().schema, at: now } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sameItems(a: unknown, b: unknown): boolean {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((item, i) => item === b[i])
  );
}

function sameApartFrom(a: unknown, b: unknown, skipped: string): boolean {
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(b);
  return (
    Object.keys(a).length === keys.length &&
    keys.every((key) => key === skipped || (key in a && a[key] === b[key]))
  );
}

// React Flow re-measures any node it gets without `measured` and remounts its
// edges, so an unchanged table keeps its node. A table whose content changed is
// re-measured even at the same size: its column handles may have moved.
export function mergeStoreNodes(
  storeNodes: readonly Node[],
  localNodes: readonly Node[],
): Node[] {
  const shown = new Map(localNodes.map((node) => [node.id, node]));
  return storeNodes.map((node) => {
    const local = shown.get(node.id);
    if (!local) return node;
    const sameContext =
      local.data.dbType === node.data.dbType &&
      sameItems(local.data.enums, node.data.enums);
    const samePosition =
      local.position.x === node.position.x && local.position.y === node.position.y;
    if (sameContext && samePosition && local.data.table === node.data.table) return local;
    const sameContent =
      sameContext && sameApartFrom(local.data.table, node.data.table, "position");
    return {
      ...node,
      ...(local.selected ? { selected: true } : {}),
      ...(sameContent && local.measured ? { measured: local.measured } : {}),
    };
  });
}
