import { describe, it, expect } from "vitest";
import { buildPreview, tableHeight, tableWidth, PREVIEW_METRICS } from "./schemaPreview";
import { createEmptySchema } from "../stores/schemaStore";
import type { Column, Schema, Table } from "../types/schema";

function column(id: string, name: string, extra: Partial<Column> = {}): Column {
  return {
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
  };
}

function table(id: string, x: number, y: number, columns: Column[]): Table {
  return { id, name: id, position: { x, y }, columns };
}

function schemaOf(tables: Table[], relations: Schema["relations"] = []): Schema {
  return { ...createEmptySchema(), tables, relations };
}

function viewBox(preview: { viewBox: string }) {
  const [x, y, w, h] = preview.viewBox.split(" ").map(Number);
  return { x, y, w, h };
}

describe("table size", () => {
  it("matches the canvas table", () => {
    const t = table("users", 0, 0, [column("a", "id"), column("b", "email")]);
    expect(tableWidth(t)).toBe(PREVIEW_METRICS.minWidth);
    expect(tableHeight(t)).toBe(
      PREVIEW_METRICS.header + 2 * PREVIEW_METRICS.padding + 2 * PREVIEW_METRICS.row,
    );
  });
  it("widens for long names", () => {
    const t = table("users", 0, 0, [
      column("a", "a_really_long_column_name_for_testing"),
    ]);
    expect(tableWidth(t)).toBeGreaterThan(PREVIEW_METRICS.minWidth);
  });
});

describe("buildPreview", () => {
  const users = table("users", 0, 0, [column("u1", "id", { isPrimaryKey: true })]);
  const posts = table("posts", 400, 100, [
    column("p1", "id", { isPrimaryKey: true }),
    column("p2", "user_id", { isForeignKey: true }),
  ]);
  const relation = {
    id: "r",
    from: { tableId: "posts", columnId: "p2" },
    to: { tableId: "users", columnId: "u1" },
    type: "N:1" as const,
    onDelete: "CASCADE" as const,
    onUpdate: "CASCADE" as const,
  };

  it("places columns on the canvas rows with their key kind", () => {
    const preview = buildPreview(schemaOf([users, posts], [relation]));
    const p = preview.tables[1];
    expect(p.columns.map((c) => c.key)).toEqual(["primary", "foreign"]);
    expect(p.columns[1].y).toBe(
      100 + PREVIEW_METRICS.header + PREVIEW_METRICS.padding + 1.5 * PREVIEW_METRICS.row,
    );
  });

  it("draws a relation from the source column's right side", () => {
    const preview = buildPreview(schemaOf([users, posts], [relation]));
    const p = preview.tables[1];
    expect(preview.edges).toHaveLength(1);
    expect(preview.edges[0].startsWith(`M${p.x + p.width},${p.columns[1].y}`)).toBe(true);
  });

  it("skips relations to unknown columns", () => {
    const broken = { ...relation, to: { tableId: "users", columnId: "nope" } };
    expect(buildPreview(schemaOf([users, posts], [broken])).edges).toHaveLength(0);
  });

  it("frames every table in a 16:10 box", () => {
    const preview = buildPreview(schemaOf([users, posts]));
    const box = viewBox(preview);
    expect(box.w / box.h).toBeCloseTo(1.6, 2);
    expect(box.x).toBeLessThanOrEqual(0);
    expect(box.x + box.w).toBeGreaterThanOrEqual(400 + preview.tables[1].width);
  });

  it("returns an empty frame for an empty schema", () => {
    expect(buildPreview(createEmptySchema())).toEqual({
      viewBox: "0 0 160 100",
      tables: [],
      edges: [],
    });
  });
});
