import { useState } from "react";
import type { DbType } from "../../types/schema";

interface NewSchemaModalProps {
  isFirstLaunch: boolean;
  onClose: () => void;
  onCreate: (name: string, dbType: DbType) => void;
}

const DB_OPTIONS: { value: DbType; label: string; description: string }[] = [
  { value: "mysql", label: "MySQL", description: "MySQL / MariaDB" },
  { value: "postgresql", label: "PostgreSQL", description: "PostgreSQL" },
];

export function NewSchemaModal({
  isFirstLaunch,
  onClose,
  onCreate,
}: NewSchemaModalProps) {
  const [name, setName] = useState("Untitled");
  const [dbType, setDbType] = useState<DbType>("postgresql");

  const handleCreate = () => {
    const trimmed = name.trim() || "Untitled";
    onCreate(trimmed, dbType);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape" && !isFirstLaunch) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={isFirstLaunch ? undefined : onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-[400px] rounded-xl border border-border bg-white p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900">New Schema</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          Choose a name and database type for your schema.
        </p>

        <div className="mt-5">
          <label className="block text-[12px] font-medium uppercase tracking-wide text-gray-400">
            Schema name
          </label>
          <input
            type="text"
            spellCheck={false}
            autoCorrect="off"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-gray-800 outline-none transition-colors focus:border-accent/40"
            placeholder="Untitled"
          />
        </div>

        <div className="mt-4">
          <label className="block text-[12px] font-medium uppercase tracking-wide text-gray-400">
            Database type
          </label>
          <div className="mt-1.5 flex rounded-lg border border-border bg-surface-muted p-0.5">
            {DB_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDbType(opt.value)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  dbType === opt.value
                    ? "bg-white text-accent shadow-soft"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {!isFirstLaunch && (
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-gray-600 transition-all hover:bg-surface-muted"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleCreate}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
