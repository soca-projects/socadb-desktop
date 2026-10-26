import { beforeEach, describe, expect, it } from "vitest";
import type { Node, NodeChange } from "@xyflow/react";
import {
  finishedMoves,
  mergeStoreNodes,
  newMoveTracker,
  NUDGE_MERGE_MS,
  saveMoves,
} from "./canvasMoves";
import { createTable } from "./schemaActions";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import type { Column, SchemaEnum, Table } from "../types/schema";

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

describe("mergeStoreNodes", () => {
  const column = (id: string): Column => ({
    id,
    name: id,
    type: "integer",
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: false,
    isUnique: false,
    isAutoIncrement: false,
    defaultValue: null,
  });
  const books: Table = {
    id: "books",
    name: "books",
    position: { x: 0, y: 0 },
    columns: [column("id"), column("title")],
  };
  const node = (
    table: Table,
    extra: Partial<Node> = {},
    enums: SchemaEnum[] = [],
  ): Node => ({
    id: table.id,
    position: table.position,
    data: { table, enums, dbType: "postgresql" },
    ...extra,
  });
  const measured = { width: 240, height: 120 };

  it("hands back the shown node of a table the change left alone", () => {
    const shown = node(books, { selected: true, measured });

    expect(mergeStoreNodes([node(books)], [shown])[0]).toBe(shown);
  });

  it("keeps the size of a table that only moved", () => {
    const moved = { ...books, position: { x: 40, y: 0 } };

    expect(
      mergeStoreNodes([node(moved)], [node(books, { selected: true, measured })]),
    ).toEqual([{ ...node(moved), selected: true, measured }]);
  });

  it("measures again a table whose columns were only reordered", () => {
    const reordered = { ...books, columns: [...books.columns].reverse() };
    const [next] = mergeStoreNodes(
      [node(reordered)],
      [node(books, { selected: true, measured })],
    );

    expect(next).toEqual({ ...node(reordered), selected: true });
    expect(next.measured).toBeUndefined();
  });

  it("measures again a table whose enums changed", () => {
    const status: SchemaEnum = { id: "status", name: "status", values: ["draft"] };
    const edited = { ...status, values: ["draft", "done"] };
    const [next] = mergeStoreNodes(
      [node(books, {}, [edited])],
      [node(books, { measured }, [status])],
    );

    expect(next.measured).toBeUndefined();
  });

  it("puts a table still being dragged back where the store has it", () => {
    const dragged = node(books, {
      position: { x: 300, y: 80 },
      dragging: true,
      measured,
    });

    expect(mergeStoreNodes([node(books)], [dragged])).toEqual([
      { ...node(books), measured },
    ]);
  });

  it("drops tables the store no longer has and takes new ones as they come", () => {
    const authors = { ...books, id: "authors", name: "authors" };

    expect(
      mergeStoreNodes([node(authors)], [node(books, { selected: true, measured })]),
    ).toEqual([node(authors)]);
  });
});
