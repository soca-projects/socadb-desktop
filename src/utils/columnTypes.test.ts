import { describe, it, expect } from "vitest";
import type { Column, SchemaEnum, Table } from "../types/schema";
import {
  isUniqueColumn,
  timeSuggestions,
  typeLabel,
  typeMenuGroups,
} from "./columnTypes";

const col = (extra: Partial<Column>): Column => ({
  id: "c1",
  name: "x",
  type: "varchar",
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: false,
  isUnique: false,
  isAutoIncrement: false,
  defaultValue: null,
  ...extra,
});

const status: SchemaEnum = { id: "e1", name: "loan_status", values: ["active", "lost"] };
const genre: SchemaEnum = { id: "e2", name: "book_genre", values: ["fiction"] };

describe("typeMenuGroups", () => {
  it("groups PostgreSQL types and lists other enums to reuse", () => {
    const groups = typeMenuGroups("postgresql", "", [status, genre], "e1");
    expect(groups.map((g) => g.id)).toEqual([
      "numbers",
      "text",
      "dateTime",
      "other",
      "reuseEnum",
    ]);
    expect(groups.find((g) => g.id === "other")?.items.map((i) => i.value)).toContain(
      "enum",
    );
    expect(groups.find((g) => g.id === "reuseEnum")?.items).toEqual([
      { value: "enum:e2", label: "book_genre", enumValues: ["fiction"] },
    ]);
  });

  it("filters by the query and lists every enum when searching enum", () => {
    expect(
      typeMenuGroups("postgresql", "ti", [], undefined).flatMap((g) =>
        g.items.map((i) => i.label),
      ),
    ).toEqual(["time", "timestamp", "timestamptz"]);
    const reuse = typeMenuGroups("postgresql", "enum", [status, genre], undefined).find(
      (g) => g.id === "reuseEnum",
    );
    expect(reuse?.items.map((i) => i.label)).toEqual(["loan_status", "book_genre"]);
  });

  it("never offers to reuse an enum in MySQL", () => {
    const groups = typeMenuGroups("mysql", "", [status], undefined);
    expect(groups.some((g) => g.id === "reuseEnum")).toBe(false);
    expect(groups.find((g) => g.id === "other")?.items.map((i) => i.value)).toContain(
      "enum",
    );
  });

  it("drops empty groups", () => {
    expect(typeMenuGroups("mysql", "zz", [], undefined)).toEqual([]);
  });
});

describe("typeLabel", () => {
  it("shows lengths and precision", () => {
    expect(typeLabel(col({ type: "varchar", length: 120 }))).toBe("varchar(120)");
    expect(typeLabel(col({ type: "decimal", precision: 10, scale: 2 }))).toBe(
      "decimal(10,2)",
    );
    expect(typeLabel(col({ type: "numeric", precision: 8 }))).toBe("numeric(8)");
    expect(typeLabel(col({ type: "text" }))).toBe("text");
  });
});

describe("timeSuggestions", () => {
  it("fits the type and the dialect", () => {
    expect(timeSuggestions("date", "postgresql").map((s) => s.value)).toEqual([
      "CURRENT_DATE",
    ]);
    expect(timeSuggestions("timestamptz", "postgresql").map((s) => s.value)).toEqual([
      "now()",
      "CURRENT_TIMESTAMP",
    ]);
    expect(timeSuggestions("datetime", "mysql").map((s) => s.value)).toEqual([
      "CURRENT_TIMESTAMP",
    ]);
  });
});

describe("isUniqueColumn", () => {
  const table = (columns: Column[], indexes: Table["indexes"] = []): Table => ({
    id: "t1",
    name: "t",
    position: { x: 0, y: 0 },
    columns,
    indexes,
  });

  it("counts the flag and one-column unique indexes, not the primary key", () => {
    const pk = col({ id: "pk", isPrimaryKey: true, isUnique: true });
    const flagged = col({ id: "a", isUnique: true });
    const indexed = col({ id: "b" });
    const composite = col({ id: "c" });
    const t = table(
      [pk, flagged, indexed, composite],
      [
        { id: "i1", columnIds: ["b"], unique: true },
        { id: "i2", columnIds: ["c", "b"], unique: true },
      ],
    );
    expect([pk, flagged, indexed, composite].map((c) => isUniqueColumn(t, c))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});
