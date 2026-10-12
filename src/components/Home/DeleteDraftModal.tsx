import { useTranslation } from "react-i18next";
import { Modal } from "../Modal/Modal";

interface DeleteDraftModalProps {
  name: string;
  onDelete: () => void;
  onClose: () => void;
}

export function DeleteDraftModal({ name, onDelete, onClose }: DeleteDraftModalProps) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onClose} ariaLabelledBy="delete-draft-title">
      <div className="p-6">
        <h2 id="delete-draft-title" className="text-base font-semibold text-primary">
          {t("home.deleteDraft.title")}
        </h2>
        <p className="mt-1 text-[13px] text-tertiary">
          {t("home.deleteDraft.description", { name })}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
          >
            {t("home.cancel")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-red-600/90 active:scale-[0.98]"
          >
            {t("home.deleteDraft.confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
