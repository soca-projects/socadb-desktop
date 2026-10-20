import { describe, it, expect, beforeEach } from "vitest";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import { editIndex } from "./indexActions";
import type { Column, TableIndex } from "../types/schema";

const col = (id: string): Column => ({
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

const stored: TableIndex = { id: "X", columnIds: ["a"], unique: false, name: "loans_a" };

const indexes = () => useSchemaStore.getState().schema.tables[0].indexes ?? [];

describe("editIndex", () => {
  beforeEach(() => {
    useSchemaStore.setState({
      schema: {
        ...createEmptySchema("s", "postgresql"),
        tables: [
          {
            id: "t1",
            name: "loans",
            position: { x: 0, y: 0 },
            columns: [col("a"), col("b")],
            indexes: [stored],
          },
        ],
      },
      filePath: null,
      savedAt: null,
    });
    useSchemaStore.temporal.getState().clear();
  });

  it("updates a stored index in place", () => {
    const editing = editIndex("t1", stored, false, { columnIds: ["a", "b"] });
    expect(editing).toEqual({ id: "X", draft: null });
    expect(indexes()).toEqual([{ ...stored, columnIds: ["a", "b"] }]);
  });

  it("keeps an index whose last column is unpicked as a draft with a new id", () => {
    const editing = editIndex("t1", stored, false, { columnIds: [] });
    expect(indexes()).toEqual([]);
    expect(editing.draft).toMatchObject({ columnIds: [], name: "loans_a" });
    expect(editing.draft?.id).not.toBe("X");
    expect(editing.id).toBe(editing.draft?.id);
  });

  it("adds a draft once it has a column, under the draft's id", () => {
    const draft: TableIndex = { id: "D", columnIds: [], unique: false };
    expect(editIndex("t1", draft, true, { unique: true })).toEqual({
      id: "D",
      draft: { ...draft, unique: true },
    });
    expect(indexes()).toEqual([stored]);
    expect(
      editIndex("t1", { ...draft, unique: true }, true, { columnIds: ["b"] }),
    ).toEqual({ id: "D", draft: null });
    expect(indexes().map((i) => i.id)).toEqual(["X", "D"]);
  });

  it("never duplicates an id when undo brings the index back while its draft is open", () => {
    const editing = editIndex("t1", stored, false, { columnIds: [] });
    useSchemaStore.temporal.getState().undo();
    expect(indexes()).toEqual([stored]);
    const draft = editing.draft;
    if (!draft) throw new Error("expected a draft");
    editIndex("t1", draft, true, { columnIds: ["b"] });
    const ids = indexes().map((i) => i.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
