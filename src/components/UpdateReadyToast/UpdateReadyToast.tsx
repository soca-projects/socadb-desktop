import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useUpdateStore } from "../../stores/updateStore";
import { toMessage } from "../../utils/errorMessage";

const CHANGELOG_URL = "https://socadb.com/changelog";

interface Props {
  toastId: string | number;
}

export function UpdateReadyToast({ toastId }: Props) {
  const { t } = useTranslation();
  const status = useUpdateStore((s) => s.status);
  const update = useUpdateStore((s) => s.update);
  const setPendingUpdateVersion = useUpdateStore((s) => s.setPendingUpdateVersion);
  const setStatus = useUpdateStore((s) => s.setStatus);
  const setError = useUpdateStore((s) => s.setError);

  const primaryRef = useRef<HTMLButtonElement>(null);
  const secondaryRef = useRef<HTMLButtonElement>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setCurrentVersion);
  }, []);

  if (!update) return null;
  const installing = status === "installing";

  async function handleRestart() {
    if (!update) return;
    setStatus("installing");
    try {
      await update.install();
      await relaunch();
    } catch (error) {
      const message = toMessage(error);
      console.error("[updater] install failed:", message);
      setError(message);
      toast.dismiss(toastId);
      toast.error(t("updater.failed", { error: message }), {
        duration: Infinity,
      });
    }
  }

  function handleInstallOnQuit() {
    if (!update) return;
    setPendingUpdateVersion(update.version);
    toast.dismiss(toastId);
  }

  function handleArrowNav(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      secondaryRef.current?.focus();
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      primaryRef.current?.focus();
    }
  }

  return (
    <div className="flex w-[320px] flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-float">
      <div>
        <p className="text-[13px] font-semibold text-primary">
          {installing
            ? t("updater.installingTitle")
            : t("updater.title", { version: update.version })}
        </p>
        <p className="mt-0.5 text-[11px] text-tertiary">
          {installing ? (
            t("updater.installingHint")
          ) : (
            <>
              {currentVersion
                ? `v${currentVersion} → v${update.version}`
                : `v${update.version}`}{" "}
              ·{" "}
              <button
                onClick={() => {
                  void openUrl(CHANGELOG_URL);
                }}
                className="underline decoration-tertiary/40 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
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
          onClick={handleRestart}
          onKeyDown={handleArrowNav}
          disabled={installing}
          className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white shadow-sm outline-none transition-all hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] disabled:opacity-50"
        >
          {installing ? t("updater.installing") : t("updater.restartNow")}
        </button>
        {!installing && (
          <button
            ref={secondaryRef}
            onClick={handleInstallOnQuit}
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
