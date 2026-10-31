import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { XIcon as X } from "@phosphor-icons/react";
import { useUpdateStore } from "../../stores/updateStore";
import {
  CHANGELOG_URL,
  dismissUpdate,
  downloadAvailableUpdate,
  installAndRelaunch,
} from "../../utils/updater";
import { IS_MAC } from "../../utils/platform";

export function UpdateReadyToast() {
  const { t } = useTranslation();
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.version);
  const canInstallOnQuit = useUpdateStore((s) => s.canInstallOnQuit);

  const primaryRef = useRef<HTMLButtonElement>(null);
  const secondaryRef = useRef<HTMLButtonElement>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setCurrentVersion);
  }, []);

  if (!version) return null;
  const available = status === "available";
  const downloading = status === "downloading";
  const installing = status === "installing";
  const busy = downloading || installing;
  const dismissible = !busy && (available || !canInstallOnQuit);

  function handleArrowNav(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      secondaryRef.current?.focus();
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      primaryRef.current?.focus();
    }
  }

  const title = installing
    ? t("updater.installingTitle")
    : downloading
      ? t("updater.downloadingTitle", { version })
      : available
        ? t("updater.availableTitle", { version })
        : t("updater.title", { version });

  const hint = installing
    ? t(IS_MAC ? "updater.relaunchHint" : "updater.installingHint")
    : downloading
      ? t("updater.downloadingHint")
      : null;

  return (
    <div className="relative flex w-[320px] flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-float">
      {dismissible && (
        <button
          type="button"
          onClick={dismissUpdate}
          aria-label={t("updater.notNow")}
          className="absolute right-2 top-2 rounded-md p-1 text-tertiary outline-none transition-colors hover:bg-surface-muted hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={14} />
        </button>
      )}
      <div className={dismissible ? "pr-6" : undefined}>
        <p className="text-[13px] font-semibold text-primary">{title}</p>
        <p className="mt-0.5 text-[11px] text-tertiary">
          {hint ?? (
            <>
              {currentVersion ? `v${currentVersion} → v${version}` : `v${version}`} ·{" "}
              <button
                onClick={() => {
                  void openUrl(CHANGELOG_URL);
                }}
                className="cursor-pointer underline decoration-border-hover underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
              >
                {t("updater.releaseNotes")}
              </button>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          ref={primaryRef}
          onClick={() =>
            void (available ? downloadAvailableUpdate("restart") : installAndRelaunch())
          }
          onKeyDown={handleArrowNav}
          disabled={busy}
          className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white shadow-sm outline-none transition-all hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] disabled:opacity-50"
        >
          {installing
            ? t("updater.installing")
            : downloading
              ? t("updater.downloading")
              : t("updater.restartNow")}
        </button>
        {!busy && canInstallOnQuit && (
          <button
            ref={secondaryRef}
            onClick={() =>
              available ? void downloadAvailableUpdate("quit") : dismissUpdate()
            }
            onKeyDown={handleArrowNav}
            className="rounded-md px-1 py-0.5 text-center text-[11px] font-medium text-tertiary outline-none transition-colors hover:text-secondary focus-visible:text-accent focus-visible:underline"
          >
            {t("updater.installOnQuit")}
          </button>
        )}
      </div>
    </div>
  );
}
