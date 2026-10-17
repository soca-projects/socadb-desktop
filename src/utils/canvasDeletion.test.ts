import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { removableByKey } from "./canvasDeletion";

const table = (id: string, selected = false): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
  selected,
});
const relation = (
  id: string,
  source: string,
  target: string,
  selected = false,
): Edge => ({
  id,
  source,
  target,
  selected,
});

describe("removableByKey", () => {
  it("keeps a selected table and the relations React Flow adds with it", () => {
    const books = table("books", true);
    const links = [relation("r1", "loans", "books"), relation("r2", "books", "authors")];

    expect(removableByKey({ nodes: [books], edges: links })).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("removes a relation the user selected", () => {
    const picked = relation("r1", "loans", "books", true);

    expect(removableByKey({ nodes: [], edges: [picked] })).toEqual({
      nodes: [],
      edges: [picked],
    });
  });

  it("keeps the relations a box selection marks around a selected table", () => {
    const books = table("books", true);
    const boxed = [
      relation("r1", "loans", "books", true),
      relation("r2", "books", "authors", true),
    ];

    expect(removableByKey({ nodes: [books], edges: boxed })).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("removes a selected relation away from the selected tables", () => {
    const elsewhere = relation("r1", "loans", "members", true);
    const attached = relation("r2", "books", "authors", true);

    expect(
      removableByKey({ nodes: [table("books", true)], edges: [elsewhere, attached] }),
    ).toEqual({ nodes: [], edges: [elsewhere] });
  });
});
