import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import { genId } from "./id";
import { createDefaultIdColumn } from "./columnDefaults";
import { getPrimaryKeyPreference } from "./primaryKeyPreference";
import { computeAutoLayout } from "./autoLayout";
import { getNextTableColor } from "./tableColors";
import { findEnumById, findTableById, findTableByName } from "./schemaQueries";
import { uniqueEnumName } from "./schemaIntegrity";
import { logError } from "./log";
import { getCanvasView } from "./canvasView";
import { estimateTableSize, intersectsRect, placeNewTable } from "./tablePlacement";
import { toast } from "sonner";
import i18next from "../i18n";
import type { Column, Schema, SchemaEnum } from "../types/schema";

export function handleUndo() {
  const before = useSchemaStore.getState().schema;
  useSchemaStore.temporal.getState().undo();
  frameIfMovedTablesLeftView(before);
}

export function handleRedo() {
  const before = useSchemaStore.getState().schema;
  useSchemaStore.temporal.getState().redo();
  frameIfMovedTablesLeftView(before);
}

function frameIfMovedTablesLeftView(before: Schema) {
  const view = getCanvasView();
  const area = view?.visibleArea();
  const { tables } = useSchemaStore.getState().schema;
  if (!view || !area) return;
  const moved = tables.some((table) => {
    const old = findTableById(before, table.id);
    return (
      old && (old.position.x !== table.position.x || old.position.y !== table.position.y)
    );
  });
  if (!moved) return;
  const shows = tables.some((table) => {
    const size = view.measuredSize(table.id) ?? estimateTableSize(table);
    return intersectsRect(area, { ...table.position, ...size });
  });
  if (!shows) view.fitView();
}

export async function handleAutoLayout() {
  try {
    const { schema, updateTablePositions } = useSchemaStore.getState();
    const positions = await computeAutoLayout(
      schema.tables,
      schema.relations,
      useViewStore.getState().indexesOpen,
    );
    updateTablePositions(positions);
    getCanvasView()?.fitView();
  } catch (e) {
    logError("layout.auto.failed", e);
    toast.error(i18next.t("toast.autoLayoutFailed", { error: String(e) }));
  }
}

function uniqueTableName(base: string, schema: Schema): string {
  if (!findTableByName(schema, base)) return base;
  let i = 2;
  while (findTableByName(schema, `${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function createTable(options?: {
  name?: string;
  position?: { x: number; y: number };
  columns?: Column[];
  reveal?: boolean;
}): string {
  const { schema, addTable } = useSchemaStore.getState();
  const tables = schema.tables;
  const newId = genId();
  const name = uniqueTableName(options?.name ?? `new_table_${tables.length + 1}`, schema);
  const columns = options?.columns ?? [
    createDefaultIdColumn(schema.dbType, getPrimaryKeyPreference()[schema.dbType]),
  ];
  const view = getCanvasView();
  const area = view?.visibleArea();
  const size = estimateTableSize({ name, columns });
  const position =
    options?.position ??
    placeNewTable(
      tables,
      size,
      view && area
        ? {
            area,
            blocked: view.blockedAreas(),
            sizeOf: (t) => view.measuredSize(t.id) ?? estimateTableSize(t),
          }
        : null,
    );
  addTable({ id: newId, name, color: getNextTableColor(tables), position, columns });
  if (options?.reveal) view?.reveal({ ...position, ...size });
  return newId;
}

export function duplicateTable(tableId: string): string | null {
  const { schema, addTable } = useSchemaStore.getState();
  const source = findTableById(schema, tableId);
  if (!source) return null;
  const newId = genId();
  const name = uniqueTableName(`${source.name}_copy`, schema);
  const columnIds = new Map(source.columns.map((c) => [c.id, genId()]));
  // A MySQL enum belongs to its column (the SQL writes the values inline), so
  // the copy gets its own instead of sharing the original's.
  const clones: SchemaEnum[] = [];
  const columns = source.columns.map((col) => {
    const copy = { ...col, id: columnIds.get(col.id) ?? genId(), isForeignKey: false };
    const original =
      schema.dbType === "mysql" && col.enumId
        ? findEnumById(schema, col.enumId)
        : undefined;
    if (!original) return copy;
    const clone: SchemaEnum = {
      id: genId(),
      name: uniqueEnumName(
        `${name}_${col.name}`,
        [...(schema.enums ?? []), ...clones],
        [...schema.tables.map((t) => t.name), name],
      ),
      values: [...original.values],
    };
    clones.push(clone);
    return { ...copy, enumId: clone.id };
  });
  addTable(
    {
      id: newId,
      name,
      color: source.color,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      columns,
      note: source.note,
      indexes: source.indexes?.map((i) => ({
        ...i,
        id: genId(),
        name: undefined,
        columnIds: i.columnIds.map((id) => columnIds.get(id) ?? id),
      })),
    },
    clones,
  );
  return newId;
}

// Undoing past this point would show the previous schema under the new file's
// path, and saving would write it there.
export function replaceSchema(schema: Schema, filePath: string | null) {
  const store = useSchemaStore.getState();
  store.setSchema(schema);
  store.setFilePath(filePath);
  useSchemaStore.temporal.getState().clear();
  getCanvasView()?.fitView();
}

export function closeSchema() {
  replaceSchema(createEmptySchema(), null);
  useViewStore.getState().showHome();
}
