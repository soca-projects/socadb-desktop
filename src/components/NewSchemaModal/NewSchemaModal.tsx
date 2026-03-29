import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DbType } from "../../types/schema";

interface NewSchemaModalProps {
  isFirstLaunch: boolean;
  onClose: () => void;
  onCreate: (name: string, dbType: DbType) => void;
}

export function NewSchemaModal({
  isFirstLaunch,
  onClose,
  onCreate,
}: NewSchemaModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(t("newSchema.untitled"));
  const [dbType, setDbType] = useState<DbType>("postgresql");

  const handleCreate = () => {
    const trimmed = name.trim() || t("newSchema.untitled");
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
        role="dialog"
        aria-labelledby="new-schema-title"
        className="w-full max-w-[400px] rounded-xl border border-border bg-surface p-6 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-schema-title" className="text-base font-semibold text-primary">
          {t("newSchema.title")}
        </h2>
        <p className="mt-1 text-[13px] text-tertiary">{t("newSchema.description")}</p>

        <div className="mt-5">
          <label
            htmlFor="schema-name"
            className="block text-[12px] font-medium uppercase tracking-wide text-tertiary"
          >
            {t("newSchema.schemaName")}
          </label>
          <input
            id="schema-name"
            type="text"
            spellCheck={false}
            autoCorrect="off"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-primary outline-none transition-colors focus:border-accent/40"
            placeholder={t("newSchema.untitled")}
          />
        </div>

        <div className="mt-4">
          <label
            id="db-type-label"
            className="block text-[12px] font-medium uppercase tracking-wide text-tertiary"
          >
            {t("newSchema.databaseType")}
          </label>
          <div
            role="radiogroup"
            aria-labelledby="db-type-label"
            className="mt-1.5 flex rounded-lg border border-border bg-surface-muted p-0.5"
          >
            {(["mysql", "postgresql"] as const).map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={dbType === value}
                onClick={() => setDbType(value)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  dbType === value
                    ? "bg-surface text-accent shadow-soft"
                    : "text-tertiary hover:text-secondary"
                }`}
              >
                {value === "mysql" ? t("toolbar.mysql") : t("toolbar.postgresql")}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {!isFirstLaunch && (
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
            >
              {t("newSchema.cancel")}
            </button>
          )}
          <button
            onClick={handleCreate}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            {t("newSchema.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
