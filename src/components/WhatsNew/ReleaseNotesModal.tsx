import { useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CaretDownIcon as CaretDown, XIcon as X } from "@phosphor-icons/react";
import { Modal } from "../Modal/Modal";
import { ReleaseText } from "./ReleaseText";
import {
  formatReleaseDate,
  releasesAfter,
  releasesFor,
  sectionKind,
  type Release,
  type SectionKind,
} from "../../utils/releaseNotes";
import { CHANGELOG_URL } from "../../utils/updater";
import type { NotesModal } from "../../stores/releaseNotesStore";
import { isLanguage, type Language } from "../../i18n";

const KIND_TINT: Record<SectionKind, string> = {
  added: "bg-emerald-600/15",
  changed: "bg-amber-600/15",
  fixed: "bg-rose-600/15",
  other: "bg-stone-500/15",
};

function ReleaseEntry({
  release,
  language,
  latest,
}: {
  release: Release;
  language: Language;
  latest: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const changes = release.sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <article className="py-5 first:pt-1">
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="text-[19px] font-bold tracking-[-0.02em] text-primary">
          <span className={latest ? "marker" : undefined}>v{release.version}</span>
        </h3>
        {release.date && (
          <time dateTime={release.date} className="shrink-0 text-[12px] text-tertiary">
            {formatReleaseDate(release.date, language)}
          </time>
        )}
      </header>
      {release.intro.map((paragraph, i) => (
        <p key={i} className="mt-2 text-[14px] leading-relaxed text-secondary">
          <ReleaseText parts={paragraph} />
        </p>
      ))}
      {changes > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          className="mt-3 flex items-center gap-1.5 rounded-md text-[12px] font-medium text-tertiary transition-colors hover:text-primary"
        >
          {open ? (
            t("whatsNew.hideChanges")
          ) : (
            <span>
              <Trans
                i18nKey="whatsNew.showChanges"
                count={changes}
                components={{ b: <span className="text-secondary" /> }}
              />
            </span>
          )}
          <CaretDown
            size={11}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
      {open && (
        <div id={detailsId}>
          {release.sections.map((section) => (
            <section key={section.title} className="mt-4">
              <h4
                className={`inline-block rounded-full border-[1.5px] border-sticker px-2.5 py-0.5 text-[11px] font-semibold text-primary ${KIND_TINT[sectionKind(section.title)]}`}
              >
                {section.title}
              </h4>
              <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-secondary marker:text-tertiary">
                {section.items.map((item, i) => (
                  <li key={i}>
                    <ReleaseText parts={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

interface ReleaseNotesModalProps {
  notes: NotesModal;
  onClose: () => void;
}

export function ReleaseNotesModal({ notes, onClose }: ReleaseNotesModalProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  const history = "since" in notes && notes.since === null;
  const releases =
    "incoming" in notes
      ? notes.incoming
      : releasesAfter(releasesFor(language), notes.since);

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-[540px]"
      zIndex={60}
      ariaLabelledBy={titleId}
    >
      <div className="flex items-center justify-between px-6 pb-1 pt-4">
        <h2 id={titleId} className="text-[13px] font-semibold text-tertiary">
          {t(history ? "whatsNew.historyTitle" : "whatsNew.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("whatsNew.close")}
          className="-mr-2 rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
        >
          <X size={16} />
        </button>
      </div>
      <div className="max-h-[min(32rem,calc(100vh-10rem))] divide-y divide-border overflow-y-auto px-6 pb-2 pt-3">
        {releases.map((release, i) => (
          <ReleaseEntry
            key={release.version}
            release={release}
            language={language}
            latest={i === 0}
          />
        ))}
      </div>
      <div className="border-t border-border px-6 py-3">
        <button
          type="button"
          onClick={() => {
            void openUrl(CHANGELOG_URL);
          }}
          className="text-[12px] text-tertiary underline decoration-border-hover underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
        >
          {t("whatsNew.fullHistory")}
        </button>
      </div>
    </Modal>
  );
}
