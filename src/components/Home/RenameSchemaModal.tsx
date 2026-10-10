import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal/Modal";

interface RenameSchemaModalProps {
  initialName: string;
  onRename: (name: string) => Promise<void>;
  onClose: () => void;
}

export function RenameSchemaModal({
  initialName,
  onRename,
  onClose,
}: RenameSchemaModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(name);
    } catch (err) {
      const code = String(err);
      setError(
        code === "exists"
          ? t("home.rename.exists")
          : code === "invalid_name"
            ? t("home.rename.invalid")
            : t("home.rename.failed", { error: code }),
      );
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabelledBy="rename-schema-title">
      <form className="p-6" onSubmit={(e) => void submit(e)}>
        <h2 id="rename-schema-title" className="text-base font-semibold text-primary">
          {t("home.rename.title")}
        </h2>
        <label
          htmlFor="rename-schema-input"
          className="mt-5 block text-[12px] font-medium uppercase tracking-wide text-tertiary"
        >
          {t("home.rename.label")}
        </label>
        <input
          id="rename-schema-input"
          type="text"
          autoFocus
          spellCheck={false}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={error !== null}
          aria-describedby={error ? "rename-schema-error" : undefined}
          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-primary outline-none transition-colors focus:border-accent/40"
        />
        {error && (
          <p
            id="rename-schema-error"
            role="alert"
            className="mt-2 text-[12px] text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
          >
            {t("home.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-hover disabled:opacity-60"
          >
            {t("home.rename.confirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
