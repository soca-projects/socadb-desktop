import { useSchemaStore } from "../stores/schemaStore";
import { genId } from "./id";
import type { TableIndex } from "../types/schema";

export interface IndexEditing {
  id: string;
  draft: TableIndex | null;
}

// The store drops an index without columns, so an index whose last column is
// unpicked lives on as a draft. The draft gets a new id: undo can bring the old
// index back while the draft is still open, and the two must not share an id.
export function editIndex(
  tableId: string,
  index: TableIndex,
  isDraft: boolean,
  updates: Partial<Omit<TableIndex, "id">>,
): IndexEditing {
  const store = useSchemaStore.getState();
  const next = { ...index, ...updates };
  if (isDraft) {
    if (!next.columnIds.length) return { id: next.id, draft: next };
    store.addIndex(tableId, next);
    return { id: next.id, draft: null };
  }
  if (!next.columnIds.length) {
    store.deleteIndex(tableId, index.id);
    const draft = { ...next, id: genId() };
    return { id: draft.id, draft };
  }
  store.updateIndex(tableId, index.id, updates);
  return { id: index.id, draft: null };
}
