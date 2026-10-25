import { beforeEach, describe, expect, it } from "vitest";
import type { Node, NodeChange } from "@xyflow/react";
import {
  finishedMoves,
  keepSelection,
  newMoveTracker,
  NUDGE_MERGE_MS,
  saveMoves,
} from "./canvasMoves";
import { createTable } from "./schemaActions";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";

const table = (id: string, x = 0, selected?: boolean): Node => ({
  id,
  position: { x, y: 0 },
  data: { name: id },
  ...(selected === undefined ? {} : { selected }),
});

const moveTo = (id: string, x: number, dragging: boolean): NodeChange => ({
  id,
  type: "position",
  position: { x, y: 0 },
  dragging,
});

describe("finishedMoves", () => {
  it("returns every table a drag leaves, not just the one held", () => {
    const changes: NodeChange[] = [
      { id: "books", type: "position", position: { x: 40, y: 10 }, dragging: false },
      { id: "authors", type: "position", position: { x: 300, y: 10 }, dragging: false },
    ];

    expect(finishedMoves(changes)).toEqual({
      books: { x: 40, y: 10 },
      authors: { x: 300, y: 10 },
    });
  });

  it("ignores positions while a drag is still going", () => {
    expect(finishedMoves([moveTo("books", 12, true)])).toBeNull();
  });

  it("ignores selection and measurement changes", () => {
    const changes: NodeChange[] = [
      { id: "books", type: "select", selected: true },
      { id: "books", type: "dimensions", dimensions: { width: 240, height: 180 } },
      { id: "books", type: "position", dragging: false },
    ];

    expect(finishedMoves(changes)).toBeNull();
  });
});

describe("saveMoves", () => {
  let books: string;
  let authors: string;
  const history = () => useSchemaStore.temporal.getState();
  const xOf = (id: string) =>
    useSchemaStore.getState().schema.tables.find((t) => t.id === id)?.position.x;

  beforeEach(() => {
    useSchemaStore.setState({ schema: createEmptySchema("test", "postgresql") });
    books = createTable({ name: "books", position: { x: 100, y: 0 } });
    authors = createTable({ name: "authors", position: { x: 400, y: 0 } });
    history().clear();
  });

  it("saves every dragged table at the end of the drag, as one undo step", () => {
    const tracker = newMoveTracker();
    saveMoves([moveTo(books, 150, true), moveTo(authors, 450, true)], tracker, 0);
    expect(xOf(books)).toBe(100);

    saveMoves([moveTo(books, 160, false), moveTo(authors, 460, false)], tracker, 10);
    expect([xOf(books), xOf(authors)]).toEqual([160, 460]);
    expect(history().pastStates).toHaveLength(1);

    history().undo();
    expect([xOf(books), xOf(authors)]).toEqual([100, 400]);
  });

  it("keeps a held arrow key in one undo step", () => {
    const tracker = newMoveTracker();
    for (let press = 1; press <= 60; press++) {
      saveMoves([moveTo(books, 100 + press * 5, false)], tracker, press * 30);
    }
    expect(xOf(books)).toBe(400);
    expect(history().pastStates).toHaveLength(1);

    history().undo();
    expect(xOf(books)).toBe(100);
  });

  it("starts a new undo step after a pause or another edit", () => {
    const tracker = newMoveTracker();
    saveMoves([moveTo(books, 105, false)], tracker, 0);
    saveMoves([moveTo(books, 110, false)], tracker, NUDGE_MERGE_MS + 1);
    expect(history().pastStates).toHaveLength(2);

    useSchemaStore.getState().updateTable(authors, { name: "writers" });
    saveMoves([moveTo(books, 115, false)], tracker, NUDGE_MERGE_MS + 2);
    expect(history().pastStates).toHaveLength(4);
  });

  it("does not merge into a run once something was undone", () => {
    const tracker = newMoveTracker();
    saveMoves([moveTo(books, 105, false)], tracker, 0);
    useSchemaStore.getState().updateTable(authors, { name: "writers" });
    history().undo();

    saveMoves([moveTo(books, 110, false)], tracker, 10);

    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(xOf(books)).toBe(105);
  });

  it("saves nothing for a table that is gone or did not move", () => {
    const tracker = newMoveTracker();
    const before = useSchemaStore.getState().schema;

    saveMoves([moveTo("deleted", 50, false), moveTo(books, 100, false)], tracker, 0);

    expect(useSchemaStore.getState().schema).toBe(before);
    expect(history().pastStates).toHaveLength(0);
  });
});

describe("keepSelection", () => {
  it("keeps the selected tables on the nodes the store sends next", () => {
    const local = [
      table("books", 40, true),
      table("authors", 300, true),
      table("loans", 0, false),
    ];
    const store = [table("books", 45), table("authors", 305), table("loans", 0)];

    expect(keepSelection(store, local)).toEqual([
      { ...store[0], selected: true },
      { ...store[1], selected: true },
      store[2],
    ]);
  });

  it("drops a selected table the store no longer has", () => {
    const local = [table("books", 0, true), table("authors", 0, true)];
    const store = [table("authors", 0)];

    expect(keepSelection(store, local)).toEqual([{ ...store[0], selected: true }]);
  });

  it("hands back to the store when nothing is selected", () => {
    expect(keepSelection([table("books")], [table("books", 0, false)])).toBeNull();
    expect(keepSelection([table("books")], null)).toBeNull();
  });
});
