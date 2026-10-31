import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useUpdateStore } from "../../stores/updateStore";
import {
  CHANGELOG_URL,
  handleUpdateMenuAction,
  updateButtonState,
} from "../../utils/updater";
import {
  asksBeforeDownloading,
  getUpdatePreferences,
  setUpdatePreferences,
  type UpdatePreferences,
} from "../../utils/updatePreferences";
import { SettingsGroup, SettingsRow, Switch } from "./SettingsRow";

export function UpdatesSection() {
  const { t } = useTranslation();
  const status = useUpdateStore((s) => s.status);
  const canInstallOnQuit = useUpdateStore((s) => s.canInstallOnQuit);
  const [version, setVersion] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(getUpdatePreferences);
  const checkLabelId = useId();
  const checkHintId = useId();
  const installLabelId = useId();
  const installHintId = useId();

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  const change = (next: UpdatePreferences) => {
    setPreferences(next);
    void setUpdatePreferences(next);
  };
  const button = updateButtonState(status);
  const installHint = asksBeforeDownloading(preferences)
    ? "settings.autoInstallOffHint"
    : canInstallOnQuit
      ? "settings.autoInstallOnHint"
      : "settings.autoInstallPromptHint";

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label={version ? `SocaDB ${version}` : "SocaDB"}
          description={
            <button
              type="button"
              onClick={() => {
                void openUrl(CHANGELOG_URL);
              }}
              className="underline decoration-border-hover underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
            >
              {t("settings.updatesReleaseNotes")}
            </button>
          }
        >
          <button
            type="button"
            onClick={handleUpdateMenuAction}
            disabled={!button.enabled}
            className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {t(button.labelKey)}
          </button>
        </SettingsRow>
      </SettingsGroup>
      <div className="mt-6">
        <SettingsGroup>
          <SettingsRow
            label={t("settings.autoCheck")}
            description={t("settings.autoCheckHint")}
            labelId={checkLabelId}
            descriptionId={checkHintId}
          >
            <Switch
              checked={preferences.autoCheck}
              disabled={false}
              onClick={() =>
                change({ ...preferences, autoCheck: !preferences.autoCheck })
              }
              labelledBy={checkLabelId}
              describedBy={checkHintId}
            />
          </SettingsRow>
          <SettingsRow
            label={t("settings.autoInstall")}
            description={t(installHint)}
            labelId={installLabelId}
            descriptionId={installHintId}
          >
            <Switch
              checked={preferences.autoInstall}
              disabled={!preferences.autoCheck}
              onClick={() =>
                change({ ...preferences, autoInstall: !preferences.autoInstall })
              }
              labelledBy={installLabelId}
              describedBy={installHintId}
            />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </>
  );
}
