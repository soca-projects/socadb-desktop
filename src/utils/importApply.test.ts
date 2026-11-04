import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(() => Promise.resolve()) }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("./autoLayout", () => ({ computeAutoLayout: vi.fn() }));

import { toast } from "sonner";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import type { Table } from "../types/schema";
import { computeAutoLayout } from "./autoLayout";
import { mergeImport } from "./importApply";

function table(id: string, x = 0): Table {
  return { id, name: id, position: { x, y: 0 }, columns: [] };
}

const laidOut = { a: { x: 10, y: 10 }, b: { x: 20, y: 20 } };

function tableIds() {
  return useSchemaStore.getState().schema.tables.map((t) => t.id);
}

function pastSteps() {
  return useSchemaStore.temporal.getState().pastStates.length;
}

describe("mergeImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeAutoLayout).mockResolvedValue(laidOut);
    useSchemaStore.getState().setSchema(createEmptySchema("shop", "postgresql"));
    useSchemaStore.temporal.getState().clear();
    useSchemaStore.getState().addTable(table("a", 1));
    useSchemaStore.temporal.getState().clear();
  });

  it("undoes the import and its placement in one step", async () => {
    await mergeImport([table("b")], [], []);
    expect(tableIds()).toEqual(["a", "b"]);
    expect(pastSteps()).toBe(1);

    useSchemaStore.temporal.getState().undo();
    expect(tableIds()).toEqual(["a"]);
    expect(useSchemaStore.getState().schema.tables[0]?.position).toEqual({ x: 1, y: 0 });
  });

  it("brings the placed tables back on redo", async () => {
    await mergeImport([table("b")], [], []);
    useSchemaStore.temporal.getState().undo();
    useSchemaStore.temporal.getState().redo();
    expect(useSchemaStore.getState().schema.tables.map((t) => t.position)).toEqual([
      laidOut.a,
      laidOut.b,
    ]);
    expect(pastSteps()).toBe(1);
  });

  it("keeps earlier steps", async () => {
    useSchemaStore.getState().addTable(table("c"));
    await mergeImport([table("b")], [], []);
    expect(pastSteps()).toBe(2);
    useSchemaStore.temporal.getState().undo();
    expect(tableIds()).toEqual(["a", "c"]);
  });

  it("keeps the whole history when something changed during the placement", async () => {
    let finish: ((positions: typeof laidOut) => void) | undefined;
    vi.mocked(computeAutoLayout).mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const merging = mergeImport([table("b")], [], []);
    useSchemaStore.getState().addTable(table("c"));
    finish?.(laidOut);
    await merging;

    expect(tableIds()).toEqual(["a", "b", "c"]);
    expect(pastSteps()).toBe(3);
    useSchemaStore.temporal.getState().undo();
    expect(tableIds()).toEqual(["a", "b", "c"]);
    useSchemaStore.temporal.getState().undo();
    expect(tableIds()).toEqual(["a", "b"]);
  });

  it("keeps the import's own step when the placement fails", async () => {
    vi.mocked(computeAutoLayout).mockRejectedValueOnce(new Error("layout failed"));
    await mergeImport([table("b")], [], []);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(pastSteps()).toBe(1);
    useSchemaStore.temporal.getState().undo();
    expect(tableIds()).toEqual(["a"]);
  });

  it("doesn't drop a step when the import is undone during the placement", async () => {
    let finish: ((positions: typeof laidOut) => void) | undefined;
    vi.mocked(computeAutoLayout).mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const merging = mergeImport([table("b")], [], []);
    useSchemaStore.temporal.getState().undo();
    finish?.(laidOut);
    await merging;
    expect(tableIds()).toEqual(["a"]);
    expect(pastSteps()).toBe(1);
    expect(useSchemaStore.temporal.getState().futureStates).toHaveLength(0);
  });

  it("still makes one step when the import is undone and redone during the placement", async () => {
    let finish: ((positions: typeof laidOut) => void) | undefined;
    vi.mocked(computeAutoLayout).mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const merging = mergeImport([table("b")], [], []);
    useSchemaStore.temporal.getState().undo();
    useSchemaStore.temporal.getState().redo();
    finish?.(laidOut);
    await merging;
    expect(pastSteps()).toBe(1);
    useSchemaStore.temporal.getState().undo();
    expect(tableIds()).toEqual(["a"]);
  });

  it("lets the caller catch a failed import", () => {
    const { importTables } = useSchemaStore.getState();
    useSchemaStore.setState({
      importTables: () => {
        throw new Error("bad import");
      },
    });
    expect(() => mergeImport([table("b")], [], [])).toThrow("bad import");
    useSchemaStore.setState({ importTables });
  });
});
