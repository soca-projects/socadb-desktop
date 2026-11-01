import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "../Modal/Modal";
import { COPYRIGHT, WEBSITE } from "../../utils/about";
import { handleShowAcknowledgments } from "../../utils/menuActions";
import appIcon from "../../../src-tauri/icons/128x128@2x.png";

export function AboutModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  return (
    <Modal onClose={onClose} ariaLabelledBy="about-title" maxWidth="max-w-[320px]">
      <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
        <img src={appIcon} alt="" className="h-16 w-16" />
        <h2 id="about-title" className="mt-4 text-base font-semibold text-primary">
          SocaDB
        </h2>
        {version && (
          <p className="mt-1 select-text text-[13px] text-tertiary">
            {t("about.version", { version })}
          </p>
        )}
        <p className="mt-3 text-[12px] text-tertiary">{COPYRIGHT}</p>
        <button
          type="button"
          onClick={() => void openUrl(WEBSITE)}
          className="mt-1 cursor-pointer text-[12px] font-medium text-accent underline-offset-2 hover:underline"
        >
          socadb.com
        </button>
        <button
          type="button"
          onClick={handleShowAcknowledgments}
          className="mt-1 cursor-pointer text-[12px] font-medium text-accent underline-offset-2 hover:underline"
        >
          {t("about.thirdPartyLicenses")}
        </button>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-6 rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
        >
          {t("about.close")}
        </button>
      </div>
    </Modal>
  );
}
