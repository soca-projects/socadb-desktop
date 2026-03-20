import { useState } from "react";
import {
  XIcon as X,
  FileCodeIcon as FileCode,
  BracketsAngleIcon as BracketsAngle,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { message } from "@tauri-apps/plugin-dialog";
import { useSchemaStore, createEmptySchema } from "../../stores/schemaStore";
import { parseSqlDdl, adaptColumnsToDbType } from "../../utils/importSql";
import { parseJsonSchema } from "../../utils/importJson";
import { getNextTableColor } from "../../utils/tableColors";
import { handleAutoLayout } from "../../utils/schemaActions";
import type { DbType, Table, Relation } from "../../types/schema";

type ImportFormat = "sql" | "json";
type ImportMode = "replace" | "merge";

interface ConflictState {
  tables: Table[];
  relations: Relation[];
  fileDbType: DbType;
  currentDbType: DbType;
  skipped: number;
}

interface ImportModalProps {
  onClose: () => void;
}

export function ImportModal({ onClose }: ImportModalProps) {
  const [format, setFormat] = useState<ImportFormat>("sql");
  const [mode, setMode] = useState<ImportMode>("replace");
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const showImportSummary = async (
    tableCount: number,
    relationCount: number,
    skipped: number,
    adaptedColumns = 0,
  ) => {
    const parts = [`Imported ${tableCount} table${tableCount !== 1 ? "s" : ""}`];
    if (relationCount > 0) {
      parts.push(`${relationCount} relation${relationCount !== 1 ? "s" : ""}`);
    }
    let text = parts.join(" and ") + ".";
    if (skipped > 0) {
      text += `\n${skipped} table${skipped !== 1 ? "s" : ""} could not be parsed.`;
    }
    if (adaptedColumns > 0) {
      text += `\n${adaptedColumns} column${adaptedColumns !== 1 ? "s" : ""} had incompatible types and were set to varchar.`;
    }
    await message(text, { title: "Import Complete" });
  };

  const assignColors = (tables: Table[]): Table[] => {
    const colored: Table[] = [];
    for (const table of tables) {
      const color = getNextTableColor(colored);
      colored.push({ ...table, color });
    }
    return colored;
  };

  const replaceSchema = (tables: Table[], relations: Relation[], dbType: DbType) => {
    const store = useSchemaStore.getState();
    const schema = createEmptySchema(store.schema.name, dbType);
    schema.tables = assignColors(tables);
    schema.relations = relations;
    store.setSchema(schema);
    store.setFilePath(null);
    void handleAutoLayout();
  };

  const handleImport = async () => {
    try {
      const filters =
        format === "sql"
          ? [{ name: "SQL File", extensions: ["sql"] }]
          : [{ name: "JSON File", extensions: ["json"] }];

      const selected = await open({
        multiple: false,
        directory: false,
        filters,
      });
      if (!selected) return;

      const content = await readTextFile(selected);
      const { tables, relations, detectedDbType, attempted } =
        format === "sql" ? parseSqlDdl(content) : parseJsonSchema(content);

      if (tables.length === 0) {
        await message("No tables found in the file.", {
          title: "Import Error",
          kind: "error",
        });
        return;
      }

      const store = useSchemaStore.getState();
      const skipped = attempted - tables.length;

      if (mode === "replace") {
        replaceSchema(tables, relations, detectedDbType ?? store.schema.dbType);
      } else {
        const currentDbType = store.schema.dbType;

        if (detectedDbType && detectedDbType !== currentDbType) {
          setConflict({
            tables,
            relations,
            fileDbType: detectedDbType,
            currentDbType,
            skipped,
          });
          return;
        }

        mergeIntoSchema(tables, relations);
      }

      await showImportSummary(tables.length, relations.length, skipped);
      onClose();
    } catch (e) {
      await message(`Failed to import: ${e}`, {
        title: "Import Error",
        kind: "error",
      });
    }
  };

  const mergeIntoSchema = (tables: Table[], relations: Relation[]) => {
    const store = useSchemaStore.getState();
    const existingNames = new Set(store.schema.tables.map((t) => t.name.toLowerCase()));
    const allTables = [...store.schema.tables];

    const renamedTables = tables.map((table) => {
      let name = table.name;
      if (existingNames.has(name.toLowerCase())) {
        let counter = 2;
        while (existingNames.has(`${table.name.toLowerCase()}_${counter}`)) {
          counter++;
        }
        name = `${table.name}_${counter}`;
      }
      existingNames.add(name.toLowerCase());

      const color = getNextTableColor(allTables);
      const result = { ...table, name, color };
      allTables.push(result);
      return result;
    });

    store.importTables(renamedTables, relations);
    void handleAutoLayout();
  };

  const handleConflictReplace = async () => {
    if (!conflict) return;
    replaceSchema(conflict.tables, conflict.relations, conflict.fileDbType);
    await showImportSummary(
      conflict.tables.length,
      conflict.relations.length,
      conflict.skipped,
    );
    onClose();
  };

  const handleConflictAdapt = async () => {
    if (!conflict) return;
    const { tables: adapted, adaptedCount } = adaptColumnsToDbType(
      conflict.tables,
      conflict.currentDbType,
    );
    mergeIntoSchema(adapted, conflict.relations);
    await showImportSummary(
      conflict.tables.length,
      conflict.relations.length,
      conflict.skipped,
      adaptedCount,
    );
    onClose();
  };

  if (conflict) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-labelledby="import-conflict-title"
          className="w-full max-w-[480px] rounded-xl border border-border bg-surface p-6 shadow-float"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="import-conflict-title"
                className="text-base font-semibold text-primary"
              >
                Database type conflict
              </h2>
              <p className="mt-1 text-[13px] text-tertiary">
                The imported file uses{" "}
                <span className="font-medium text-secondary">
                  {conflict.fileDbType === "mysql" ? "MySQL" : "PostgreSQL"}
                </span>{" "}
                but your current schema is{" "}
                <span className="font-medium text-secondary">
                  {conflict.currentDbType === "mysql" ? "MySQL" : "PostgreSQL"}
                </span>
                .
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => void handleConflictReplace()}
              className="rounded-lg border border-border px-4 py-2.5 text-left text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
            >
              Replace schema
              <span className="mt-0.5 block text-[12px] font-normal text-tertiary">
                Switch to {conflict.fileDbType === "mysql" ? "MySQL" : "PostgreSQL"} and
                replace all tables
              </span>
            </button>
            <button
              onClick={() => void handleConflictAdapt()}
              className="rounded-lg border border-border px-4 py-2.5 text-left text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
            >
              Import as {conflict.currentDbType === "mysql" ? "MySQL" : "PostgreSQL"}
              <span className="mt-0.5 block text-[12px] font-normal text-tertiary">
                Adapt column types to match the current schema
              </span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-tertiary transition-all hover:bg-surface-muted hover:text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const formatCards: {
    type: ImportFormat;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      type: "sql",
      label: "SQL",
      description: "Import from SQL DDL file",
      icon: <FileCode size={24} />,
    },
    {
      type: "json",
      label: "JSON",
      description: "Import from JSON file",
      icon: <BracketsAngle size={24} />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="import-title"
        className="w-full max-w-[480px] rounded-xl border border-border bg-surface p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="import-title" className="text-base font-semibold text-primary">
              Import schema
            </h2>
            <p className="mt-1 text-[13px] text-tertiary">
              Import tables from an existing file.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {formatCards.map((card) => (
            <button
              key={card.type}
              onClick={() => setFormat(card.type)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-all ${
                format === card.type
                  ? "border-accent bg-accent/[0.05] text-accent"
                  : "border-border text-tertiary hover:border-border-hover hover:text-secondary"
              }`}
            >
              {card.icon}
              <span className="text-[13px] font-medium">{card.label}</span>
              <span className="text-[11px] leading-tight text-tertiary">
                {card.description}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label
            id="import-mode-label"
            className="block text-[12px] font-medium uppercase tracking-wide text-tertiary"
          >
            Mode
          </label>
          <div
            role="radiogroup"
            aria-labelledby="import-mode-label"
            className="mt-1.5 flex rounded-lg border border-border bg-surface-muted p-0.5"
          >
            {(["replace", "merge"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition-all ${
                  mode === m
                    ? "bg-surface text-accent shadow-soft"
                    : "text-tertiary hover:text-secondary"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => void handleImport()}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
