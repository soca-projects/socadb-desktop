import { useSchemaStore } from "../stores/schemaStore";
import { genId } from "./id";
import { createDefaultIdColumn } from "./columnDefaults";
import { computeAutoLayout } from "./autoLayout";
import { getNextTableColor } from "./tableColors";
import { findTableById } from "./schemaQueries";
import { toast } from "sonner";
import i18next from "../i18n";
import type { Column } from "../types/schema";

export function handleUndo() {
  useSchemaStore.temporal.getState().undo();
}

export function handleRedo() {
  useSchemaStore.temporal.getState().redo();
}

export async function handleAutoLayout() {
  try {
    const { schema, updateTablePositions } = useSchemaStore.getState();
    const positions = await computeAutoLayout(schema.tables, schema.relations);
    updateTablePositions(positions);
  } catch (e) {
    toast.error(i18next.t("toast.autoLayoutFailed", { error: String(e) }));
  }
}

export function createTable(options?: {
  name?: string;
  position?: { x: number; y: number };
  columns?: Column[];
}): string {
  const { schema, addTable } = useSchemaStore.getState();
  const tables = schema.tables;
  const newId = genId();
  addTable({
    id: newId,
    name: options?.name ?? `new_table_${tables.length + 1}`,
    color: getNextTableColor(tables),
    position: options?.position ?? {
      x: 100 + tables.length * 50,
      y: 100 + tables.length * 50,
    },
    columns: options?.columns ?? [createDefaultIdColumn(schema.dbType)],
  });
  return newId;
}

export function duplicateTable(tableId: string): string | null {
  const { schema, addTable } = useSchemaStore.getState();
  const source = findTableById(schema, tableId);
  if (!source) return null;
  const newId = genId();
  addTable({
    id: newId,
    name: `${source.name}_copy`,
    color: source.color,
    position: { x: source.position.x + 40, y: source.position.y + 40 },
    columns: source.columns.map((col) => ({ ...col, id: genId(), isForeignKey: false })),
  });
  return newId;
}
