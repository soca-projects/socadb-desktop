import { describe, it, expect } from "vitest";
import type { Column, Table, TableIndex } from "../types/schema";
import {
  derivedIndexName,
  indexColumnNames,
  toggleIndexColumn,
  unindexedForeignKeys,
} from "./indexHelpers";

const col = (id: string, name: string, extra: Partial<Column> = {}): Column => ({
  id,
  name,
  type: "integer",
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: false,
  isUnique: false,
  isAutoIncrement: false,
  defaultValue: null,
  ...extra,
});

const loans = (indexes: TableIndex[] = [], extra: Column[] = []): Table => ({
  id: "t1",
  name: "loans",
  position: { x: 0, y: 0 },
  columns: [
    col("id", "id", { isPrimaryKey: true, isUnique: true }),
    col("book", "book_id", { isForeignKey: true }),
    col("member", "member_id", { isForeignKey: true }),
    col("due", "due_on", { type: "date" }),
    ...extra,
  ],
  indexes,
});

describe("derivedIndexName", () => {
  it("joins the table and column names, _idx or _key", () => {
    const table = loans();
    expect(derivedIndexName(table, { columnIds: ["member", "due"], unique: false })).toBe(
      "loans_member_id_due_on_idx",
    );
    expect(derivedIndexName(table, { columnIds: ["book"], unique: true })).toBe(
      "loans_book_id_key",
    );
    expect(derivedIndexName(table, { columnIds: [], unique: false })).toBe("loans_idx");
  });
});

describe("indexColumnNames", () => {
  it("lists names in index order and skips unknown ids", () => {
    expect(indexColumnNames(loans(), { columnIds: ["due", "gone", "member"] })).toEqual([
      "due_on",
      "member_id",
    ]);
  });
});

describe("toggleIndexColumn", () => {
  it("appends a new column and removes a picked one", () => {
    expect(toggleIndexColumn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIndexColumn(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("unindexedForeignKeys", () => {
  it("lists PostgreSQL foreign keys no index starts with", () => {
    const table = loans([{ id: "i1", columnIds: ["due", "member"], unique: false }]);
    expect(unindexedForeignKeys(table, "postgresql").map((c) => c.name)).toEqual([
      "book_id",
      "member_id",
    ]);
  });

  it("counts an index that starts with the key, the UNIQUE flag and the first primary key", () => {
    const table = loans(
      [{ id: "i1", columnIds: ["member", "due"], unique: false }],
      [
        col("isbn", "isbn_ref", { isForeignKey: true, isUnique: true }),
        col("copy", "copy_id", { isForeignKey: true, isPrimaryKey: true }),
      ],
    );
    expect(unindexedForeignKeys(table, "postgresql").map((c) => c.name)).toEqual([
      "book_id",
      "copy_id",
    ]);
  });

  it("never hints in MySQL, which indexes foreign keys itself", () => {
    expect(unindexedForeignKeys(loans(), "mysql")).toEqual([]);
  });
});
