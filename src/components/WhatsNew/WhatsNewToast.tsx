import { Trans, useTranslation } from "react-i18next";
import { ArrowRightIcon as ArrowRight, XIcon as X } from "@phosphor-icons/react";
import { useReleaseNotesStore } from "../../stores/releaseNotesStore";

export function WhatsNewToast({ since, version }: { since: string; version: string }) {
  const { t } = useTranslation();
  const dismissToast = useReleaseNotesStore((s) => s.dismissToast);
  const openNotes = useReleaseNotesStore((s) => s.openNotes);

  return (
    <div className="relative flex w-[320px] flex-col items-start gap-1 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-float">
      <button
        type="button"
        onClick={dismissToast}
        aria-label={t("updater.notNow")}
        className="absolute right-2 top-2 rounded-md p-1 text-tertiary outline-none transition-colors hover:bg-surface-muted hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X size={14} />
      </button>
      <p className="pr-6 text-[13px] font-semibold text-primary">
        <Trans
          i18nKey="whatsNew.toastTitle"
          values={{ version }}
          components={{ mark: <span className="marker" /> }}
        />
      </p>
      <button
        type="button"
        onClick={() => openNotes(since)}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 text-[12px] font-medium text-accent outline-none transition-colors hover:text-accent-hover hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("whatsNew.show")}
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
