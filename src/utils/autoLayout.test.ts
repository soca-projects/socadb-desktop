import { describe, it, expect } from "vitest";
import type { Table } from "../types/schema";
import { estimateNodeHeight } from "./autoLayout";

const table = (indexes: number): Table => ({
  id: "t1",
  name: "loans",
  position: { x: 0, y: 0 },
  columns: [],
  indexes: Array.from({ length: indexes }, (_, i) => ({
    id: `i${i}`,
    columnIds: ["c1"],
    unique: false,
  })),
});

describe("estimateNodeHeight", () => {
  it("adds the INDEXES line, and one line per index once expanded", () => {
    const bare = estimateNodeHeight(table(0), true);
    expect(estimateNodeHeight(table(3), false)).toBe(bare + 28);
    expect(estimateNodeHeight(table(3), true)).toBe(bare + 28 + 3 * 24);
  });
});
