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

export function keepSelection<N extends Node>(
  storeNodes: N[],
  localNodes: readonly Node[] | null,
): N[] | null {
  if (!localNodes) return null;
  const selected = new Set(
    localNodes.filter((node) => node.selected).map((node) => node.id),
  );
  if (selected.size === 0) return null;
  return storeNodes.map((node) =>
    selected.has(node.id) ? { ...node, selected: true } : node,
  );
}
