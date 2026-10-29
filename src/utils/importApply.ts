import { emit } from "@tauri-apps/api/event";
import { toast } from "sonner";
import i18next from "../i18n";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import type { DbType, Relation, SchemaEnum, Table } from "../types/schema";
import { describeImportIssues } from "./importReport";
import { handleAutoLayout, replaceSchema } from "./schemaActions";
import { hasUnsavedChanges } from "./schemaQueries";
import type { ImportIssue } from "./sqlColumns";
import { colorTables } from "./tableColors";

export interface ImportSummary {
  tables: number;
  relations: number;
  skipped: number;
  adapted?: number;
  issues: readonly ImportIssue[];
}

export function showImportSummary({
  tables,
  relations,
  skipped,
  adapted = 0,
  issues,
}: ImportSummary) {
  let text = i18next.t("toast.importComplete", { count: tables });
  if (relations > 0) {
    text += i18next.t("toast.importRelations", { count: relations });
  }
  text += ".";
  if (skipped > 0) {
    text += " " + i18next.t("toast.importSkipped", { count: skipped });
  }
  if (adapted > 0) {
    text += " " + i18next.t("toast.importAdapted", { count: adapted });
  }
  if (issues.length > 0) {
    toast.warning(text, {
      description: describeImportIssues(issues),
      duration: 10_000,
    });
  } else {
    toast.success(text);
  }
}

export async function replaceWithImport(
  tables: Table[],
  relations: Relation[],
  enums: SchemaEnum[],
  dbType: DbType,
  name: string,
) {
  const schema = createEmptySchema(name, dbType);
  schema.tables = colorTables(tables);
  schema.relations = relations;
  if (enums.length) schema.enums = enums;
  replaceSchema(schema, null);
  useSchemaStore.setState({ savedAt: null });
  useViewStore.getState().showEditor();
  await handleAutoLayout();
  // Undoing the first layout would pile every imported table at the origin.
  // If anything was edited while it ran, the history stays whole.
  const history = useSchemaStore.temporal.getState();
  if (history.pastStates.length === 1 && history.pastStates[0]?.schema === schema) {
    history.clear();
  }
}

let pendingReplace: (() => void) | null = null;

// A replacing import leaves nothing to undo, so unsaved work gets the same
// prompt as a new schema first.
export function replaceOrAskFirst(replace: () => void) {
  const { schema, filePath, savedAt } = useSchemaStore.getState();
  if (!hasUnsavedChanges(schema, filePath, savedAt)) {
    replace();
    return;
  }
  pendingReplace = replace;
  void emit("unsaved-guard-replace-import");
}

export function runPendingReplace() {
  const replace = pendingReplace;
  pendingReplace = null;
  replace?.();
}

export function dropPendingReplace() {
  pendingReplace = null;
}

export function mergeImport(tables: Table[], relations: Relation[], enums: SchemaEnum[]) {
  const store = useSchemaStore.getState();
  const existingNames = new Set(store.schema.tables.map((t) => t.name.toLowerCase()));
  const renamed = tables.map((table) => {
    let name = table.name;
    if (existingNames.has(name.toLowerCase())) {
      let counter = 2;
      while (existingNames.has(`${table.name.toLowerCase()}_${counter}`)) {
        counter++;
      }
      name = `${table.name}_${counter}`;
    }
    existingNames.add(name.toLowerCase());
    return { ...table, name };
  });
  store.importTables(colorTables(renamed, store.schema.tables), relations, enums);
  void handleAutoLayout();
}
