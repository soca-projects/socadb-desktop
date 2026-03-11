import { useSchemaStore } from "../stores/schemaStore";
import { genId } from "./id";
import { createDefaultIdColumn } from "./columnDefaults";
import { computeAutoLayout } from "./autoLayout";

export function handleUndo() {
  useSchemaStore.temporal.getState().undo();
}

export function handleRedo() {
  useSchemaStore.temporal.getState().redo();
}

export async function handleAutoLayout() {
  const { schema, updateTablePositions } = useSchemaStore.getState();
  const positions = await computeAutoLayout(schema.tables, schema.relations);
  updateTablePositions(positions);
}

export function createTable(options?: {
  name?: string;
  position?: { x: number; y: number };
}): string {
  const { schema, addTable } = useSchemaStore.getState();
  const tables = schema.tables;
  const newId = genId();
  addTable({
    id: newId,
    name: options?.name ?? `new_table_${tables.length + 1}`,
    position: options?.position ?? {
      x: 100 + tables.length * 50,
      y: 100 + tables.length * 50,
    },
    columns: [createDefaultIdColumn(schema.dbType)],
  });
  return newId;
}

export function duplicateTable(tableId: string): string | null {
  const { schema, addTable } = useSchemaStore.getState();
  const source = schema.tables.find((t) => t.id === tableId);
  if (!source) return null;
  const newId = genId();
  addTable({
    id: newId,
    name: `${source.name}_copy`,
    position: { x: source.position.x + 40, y: source.position.y + 40 },
    columns: source.columns.map((col) => ({ ...col, id: genId(), isForeignKey: false })),
  });
  return newId;
}
