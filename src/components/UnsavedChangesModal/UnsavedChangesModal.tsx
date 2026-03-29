import { useTranslation } from "react-i18next";
import { Modal } from "../Modal/Modal";

interface UnsavedChangesModalProps {
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function UnsavedChangesModal({
  onCancel,
  onDiscard,
  onSave,
}: UnsavedChangesModalProps) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onCancel} ariaLabelledBy="unsaved-changes-title" zIndex={70}>
      <div className="p-6">
        <h2 id="unsaved-changes-title" className="text-base font-semibold text-primary">
          {t("unsavedChanges.title")}
        </h2>
        <p className="mt-1 text-[13px] text-tertiary">
          {t("unsavedChanges.description")}
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
          >
            {t("unsavedChanges.cancel")}
          </button>
          <button
            onClick={onDiscard}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
          >
            {t("unsavedChanges.dontSave")}
          </button>
          <button
            onClick={onSave}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            {t("unsavedChanges.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
