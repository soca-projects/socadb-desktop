import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./autoLayout", () => ({ computeAutoLayout: vi.fn() }));
vi.mock("./log", () => ({ logError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import {
  closeSchema,
  createTable,
  duplicateTable,
  handleAutoLayout,
  handleRedo,
  handleUndo,
  replaceSchema,
} from "./schemaActions";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import { computeAutoLayout } from "./autoLayout";
import { setCanvasView, type CanvasView } from "./canvasView";

function resetStore() {
  useSchemaStore.setState({
    schema: createEmptySchema("test", "postgresql"),
    filePath: null,
    savedAt: null,
  });
}

describe("createTable", () => {
  beforeEach(resetStore);

  it("creates a table with default name", () => {
    const id = createTable();
    const { schema } = useSchemaStore.getState();
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].id).toBe(id);
    expect(schema.tables[0].name).toBe("new_table_1");
  });

  it("creates a table with custom name", () => {
    createTable({ name: "users" });
    expect(useSchemaStore.getState().schema.tables[0].name).toBe("users");
  });

  it("creates default id column when no columns provided", () => {
    createTable({ name: "users" });
    const cols = useSchemaStore.getState().schema.tables[0].columns;
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe("id");
    expect(cols[0].isPrimaryKey).toBe(true);
  });

  it("uses provided columns when given", () => {
    createTable({
      name: "users",
      columns: [
        {
          id: "c1",
          name: "email",
          type: "varchar",
          isPrimaryKey: false,
          isForeignKey: false,
          isNullable: false,
          isUnique: true,
          isAutoIncrement: false,
          defaultValue: null,
        },
      ],
    });
    const cols = useSchemaStore.getState().schema.tables[0].columns;
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe("email");
  });

  it("assigns a color", () => {
    createTable();
    expect(useSchemaStore.getState().schema.tables[0].color).toBeDefined();
  });
});

describe("duplicateTable", () => {
  beforeEach(resetStore);

  it("duplicates a table with _copy suffix", () => {
    const id = createTable({ name: "users" });
    const newId = duplicateTable(id);
    expect(newId).not.toBeNull();
    const { schema } = useSchemaStore.getState();
    expect(schema.tables).toHaveLength(2);
    expect(schema.tables[1].name).toBe("users_copy");
  });

  it("duplicates columns with new ids", () => {
    const id = createTable({ name: "users" });
    duplicateTable(id);
    const { schema } = useSchemaStore.getState();
    const original = schema.tables[0].columns[0];
    const copy = schema.tables[1].columns[0];
    expect(copy.name).toBe(original.name);
    expect(copy.id).not.toBe(original.id);
  });

  it("resets isForeignKey on duplicated columns", () => {
    const id = createTable({ name: "users" });
    useSchemaStore
      .getState()
      .updateColumn(id, useSchemaStore.getState().schema.tables[0].columns[0].id, {
        isForeignKey: true,
      });
    duplicateTable(id);
    const { schema } = useSchemaStore.getState();
    expect(schema.tables[1].columns[0].isForeignKey).toBe(false);
  });

  it("returns null for missing table", () => {
    expect(duplicateTable("missing")).toBeNull();
  });
  it("copies the note and remaps index columns", () => {
    const id = createTable({ name: "loans" });
    const store = useSchemaStore.getState();
    const colId = store.schema.tables[0].columns[0].id;
    store.updateTable(id, { note: "One row per loan." });
    store.addIndex(id, { id: "i1", columnIds: [colId], unique: true });
    const copyId = duplicateTable(id);
    const copy = useSchemaStore.getState().schema.tables.find((t) => t.id === copyId);
    expect(copy?.note).toBe("One row per loan.");
    expect(copy?.indexes).toHaveLength(1);
    expect(copy?.indexes?.[0].id).not.toBe("i1");
    expect(copy?.indexes?.[0].columnIds).toEqual([copy?.columns[0].id]);
  });

  it("shares PostgreSQL enums with the copy", () => {
    const id = createTable({ name: "loans" });
    const colId = useSchemaStore.getState().schema.tables[0].columns[0].id;
    const enumId = useSchemaStore.getState().createEnumForColumn(id, colId, ["a"]);
    const copyId = duplicateTable(id);
    const { schema } = useSchemaStore.getState();
    const copy = schema.tables.find((t) => t.id === copyId);
    expect(schema.enums).toHaveLength(1);
    expect(copy?.columns[0].enumId).toBe(enumId);
  });

  it("gives the copy its own MySQL enums", () => {
    useSchemaStore.setState({ schema: createEmptySchema("test", "mysql") });
    const id = createTable({ name: "orders" });
    const colId = useSchemaStore.getState().schema.tables[0].columns[0].id;
    const enumId = useSchemaStore.getState().createEnumForColumn(id, colId, ["a", "b"]);
    const copyId = duplicateTable(id);
    const { schema } = useSchemaStore.getState();
    const copy = schema.tables.find((t) => t.id === copyId);
    expect(schema.enums).toHaveLength(2);
    expect(copy?.columns[0].enumId).not.toBe(enumId);
    expect(schema.enums?.find((e) => e.id === copy?.columns[0].enumId)?.values).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("closeSchema", () => {
  beforeEach(resetStore);

  it("leaves an empty schema and shows the home", () => {
    useSchemaStore.setState({ filePath: "/x/a.soca" });
    createTable({ name: "users" });
    useViewStore.setState({ view: "editor" });
    closeSchema();
    const state = useSchemaStore.getState();
    expect(state.schema.tables).toHaveLength(0);
    expect(state.filePath).toBeNull();
    expect(useViewStore.getState().view).toBe("home");
  });
});

describe("framing the canvas", () => {
  const fitView = vi.fn();
  const view: CanvasView = {
    visibleArea: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
    blockedAreas: () => [],
    measuredSize: () => null,
    reveal: vi.fn(),
    contentBounds: () => null,
    fitView,
  };

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    setCanvasView(view);
  });
  afterEach(() => setCanvasView(null));

  it("frames a schema opened from the editor", () => {
    const opened = createEmptySchema("shop", "postgresql");
    replaceSchema(opened, "/x/shop.soca");
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("frames the tables where the layout put them", async () => {
    const id = createTable({ name: "users", position: { x: 0, y: 0 } });
    vi.mocked(computeAutoLayout).mockResolvedValue({ [id]: { x: 500, y: 300 } });
    const framed: unknown[] = [];
    fitView.mockImplementation(() =>
      framed.push(useSchemaStore.getState().schema.tables[0].position),
    );
    await handleAutoLayout();
    expect(framed).toEqual([{ x: 500, y: 300 }]);
  });

  it("frames the tables again when an undo leaves none on screen", () => {
    const id = createTable({ name: "users", position: { x: 5000, y: 5000 } });
    useSchemaStore.temporal.getState().clear();
    useSchemaStore.getState().updateTablePositions({ [id]: { x: 100, y: 100 } });
    handleUndo();
    expect(useSchemaStore.getState().schema.tables[0].position).toEqual({
      x: 5000,
      y: 5000,
    });
    expect(fitView).toHaveBeenCalledTimes(1);
    handleRedo();
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("keeps the view when an undo leaves a table on screen", () => {
    const id = createTable({ name: "users", position: { x: 100, y: 100 } });
    useSchemaStore.temporal.getState().clear();
    useSchemaStore.getState().updateTablePositions({ [id]: { x: 5000, y: 5000 } });
    handleUndo();
    expect(fitView).not.toHaveBeenCalled();
    handleRedo();
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("keeps the view when an undo moves no table", () => {
    createTable({ name: "orders", position: { x: 5000, y: 5000 } });
    useSchemaStore.temporal.getState().clear();
    createTable({ name: "users", position: { x: 100, y: 100 } });
    handleUndo();
    expect(useSchemaStore.getState().schema.tables).toHaveLength(1);
    handleRedo();
    handleUndo();
    expect(fitView).not.toHaveBeenCalled();
  });

  it("keeps the view when the layout fails", async () => {
    createTable({ name: "users" });
    vi.mocked(computeAutoLayout).mockRejectedValue(new Error("layout failed"));
    await handleAutoLayout();
    expect(fitView).not.toHaveBeenCalled();
  });
});
