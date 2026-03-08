import { useSchemaStore } from "../stores/schemaStore";
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
