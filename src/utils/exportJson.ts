import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useSchemaStore } from "../stores/schemaStore";
import i18next from "../i18n";

export async function exportJson() {
  try {
    const { schema } = useSchemaStore.getState();
    const schemaName = schema.name || "schema";
    const json = JSON.stringify(schema, null, 2);

    const path = await save({
      defaultPath: `${schemaName}.json`,
      filters: [{ name: i18next.t("fileFilter.json"), extensions: ["json"] }],
    });
    if (!path) return;

    await writeTextFile(path, json);
  } catch (e) {
    toast.error(i18next.t("toast.exportJsonFailed", { error: String(e) }));
  }
}
