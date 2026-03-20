import { save, message } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useSchemaStore } from "../stores/schemaStore";

export async function exportJson() {
  try {
    const { schema } = useSchemaStore.getState();
    const schemaName = schema.name || "schema";
    const json = JSON.stringify(schema, null, 2);

    const path = await save({
      defaultPath: `${schemaName}.json`,
      filters: [{ name: "JSON File", extensions: ["json"] }],
    });
    if (!path) return;

    await writeTextFile(path, json);
  } catch (e) {
    await message(`Failed to export JSON: ${e}`, {
      title: "Export Error",
      kind: "error",
    });
  }
}
