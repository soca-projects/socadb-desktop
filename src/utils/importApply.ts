import { toast } from "sonner";
import i18next from "../i18n";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import type { DbType, Relation, SchemaEnum, Table } from "../types/schema";
import { describeImportIssues } from "./importReport";
import { handleAutoLayout } from "./schemaActions";
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

export function replaceWithImport(
  tables: Table[],
  relations: Relation[],
  enums: SchemaEnum[],
  dbType: DbType,
  name: string,
) {
  const store = useSchemaStore.getState();
  const schema = createEmptySchema(name, dbType);
  schema.tables = colorTables(tables);
  schema.relations = relations;
  if (enums.length) schema.enums = enums;
  store.setSchema(schema);
  store.setFilePath(null);
  useViewStore.getState().showEditor();
  void handleAutoLayout();
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
