import { useState, useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal/Modal";
import {
  XIcon as X,
  CheckCircleIcon as CheckCircle,
  TerminalWindowIcon as TerminalWindow,
  RobotIcon as Robot,
  ChatsCircleIcon as ChatsCircle,
  PlugsConnectedIcon as PlugsConnected,
  SlidersHorizontalIcon as SlidersHorizontal,
  MonitorIcon as Monitor,
  SunIcon as Sun,
  MoonIcon as Moon,
} from "@phosphor-icons/react";
import { useChatStore } from "../../stores/chatStore";
import { useThemeStore } from "../../stores/themeStore";
import { ClaudeIcon } from "../../assets/icons/ClaudeIcon";
import { CodexIcon } from "../../assets/icons/CodexIcon";
import {
  clearApiKey,
  isApiKeyStored,
  persistProvider,
  saveApiKey,
} from "../../utils/chatPersistence";
import {
  makeProvider,
  PROVIDERS,
  PROVIDER_IDS,
  type LoginType,
  type ProviderId,
  type Provider,
} from "../../types/chat";
import { SUPPORTED_LANGUAGES, isLanguage, type Language } from "../../i18n";
import {
  getPrimaryKeyPreference,
  setPrimaryKeyPreference,
} from "../../utils/primaryKeyPreference";
import { idColumnSql, type PrimaryKeyKind } from "../../utils/columnDefaults";
import type { DbType } from "../../types/schema";
import {
  getStartupPreference,
  setStartupPreference,
  type StartupPreference,
} from "../../utils/startupPreference";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { CopyableCommand } from "./CopyableCommand";
import { IntegrationsSection } from "./IntegrationsSection";
import { SelectMenu, type SelectOption } from "../SelectMenu/SelectMenu";
import { PrimaryKeyKindZ, ThemePreferenceZ } from "../../utils/zodSchemas";
import { APPEARANCE_HINT_KEY } from "../../utils/platform";
import type { ThemePreference } from "../../stores/themeStore";
import {
  DisclosureRow,
  SETTINGS_SELECT,
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
} from "./SettingsRow";
import { arrowTarget } from "../../utils/arrowKeys";

type Section = "agents" | "conversations" | "integrations" | "general";

const SECTIONS: { id: Section; Icon: typeof Robot }[] = [
  { id: "agents", Icon: Robot },
  { id: "conversations", Icon: ChatsCircle },
  { id: "integrations", Icon: PlugsConnected },
  { id: "general", Icon: SlidersHorizontal },
];

const THEME_ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const STARTUP_OPTIONS: StartupPreference[] = ["home", "lastSchema"];

const PRIMARY_KEY_DBS: { dbType: DbType; labelKey: string }[] = [
  { dbType: "postgresql", labelKey: "settings.primaryKeyPostgresql" },
  { dbType: "mysql", labelKey: "settings.primaryKeyMysql" },
];

interface SettingsModalProps {
  onClose: () => void;
}

const PROVIDER_ICONS: Record<ProviderId, typeof ClaudeIcon> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
};

const PROVIDER_ICON_BG: Record<ProviderId, string> = {
  claude: "bg-[#D97757]/10",
  codex: "bg-stone-500/10 dark:bg-stone-400/10",
};

function SubscriptionGuidance({ providerId }: { providerId: ProviderId }) {
  const { t } = useTranslation();
  const meta = PROVIDERS[providerId];

  return (
    <DisclosureRow label={t("agent.setUp", { name: meta.cliName })}>
      <button
        onClick={() => void invoke("open_terminal")}
        className="inline-flex items-center gap-2 rounded-md bg-stone-800 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-stone-700 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        <TerminalWindow size={13} />
        {t("agent.openTerminal")}
      </button>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-secondary">
          {t("agent.stepInstall", { name: meta.cliName })}
        </p>
        <CopyableCommand>{meta.installCommand}</CopyableCommand>
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-secondary">
          {t("agent.stepSignIn", { name: meta.cliName })}
        </p>
        <CopyableCommand>{meta.startCommand}</CopyableCommand>
        <p className="mt-1 text-[11px] text-tertiary">
          {t(`provider.${providerId}.signInHint`)}
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-secondary">
          {t("agent.stepLogin")}
        </p>
        <CopyableCommand>{meta.loginCommand}</CopyableCommand>
      </div>
    </DisclosureRow>
  );
}

function ApiKeyPanel({
  providerId,
  hasKey,
}: {
  providerId: ProviderId;
  hasKey: boolean;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const meta = PROVIDERS[providerId];

  // Re-derive `apiKeyStored` from the keyring on mount so a drift between the
  // store snapshot and the OS keyring (e.g. user wiped credentials manually)
  // self-corrects on the next visit to Settings. The pre-probe snapshot lets
  // a save/remove that lands during the probe's await window keep its truth
  // — without it, a slow keyring read (locked secret service on Linux) would
  // resolve with stale data and clobber a fresh user action.
  useEffect(() => {
    const snapshot = useChatStore.getState().providers[providerId]?.apiKeyStored ?? false;
    void isApiKeyStored(providerId).then((present) => {
      const current = useChatStore.getState().providers[providerId];
      if (!current) return;
      if (current.apiKeyStored !== snapshot) return;
      if (current.apiKeyStored !== present) {
        persistProvider(providerId, makeProvider(providerId, current.loginType, present));
      }
    });
  }, [providerId]);

  const save = useCallback(async () => {
    const key = input.trim();
    if (key.length < meta.apiKeyMinLength) return;
    setSaving(true);
    const ok = await saveApiKey(providerId, key);
    setSaving(false);
    if (!ok) {
      toast.error(t("agent.keyringUnavailable"));
      return;
    }
    persistProvider(providerId, makeProvider(providerId, "api-key", true));
    setInput("");
  }, [input, providerId, meta.apiKeyMinLength, t]);

  const remove = useCallback(async () => {
    const ok = await clearApiKey(providerId);
    if (!ok) {
      toast.error(t("agent.disconnectFailed"));
      return;
    }
    persistProvider(providerId, makeProvider(providerId, "api-key", false));
  }, [providerId, t]);

  return (
    <div className="space-y-2 px-4 py-3.5">
      <p className="text-[12px] text-tertiary">
        {t("agent.apiKeyGetFrom")}{" "}
        <button
          type="button"
          onClick={() => void openUrl(meta.consoleUrl)}
          className="cursor-pointer font-medium text-accent underline-offset-2 hover:underline"
        >
          {t(`provider.${providerId}.consoleName`)}
        </button>
        .
      </p>
      <div className="flex items-center gap-2">
        <input
          type="password"
          placeholder={hasKey ? t("agent.apiKeyReplace") : meta.apiKeyPlaceholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-primary placeholder:font-sans placeholder:text-[12px] placeholder:text-tertiary focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => void save()}
          disabled={input.trim().length < meta.apiKeyMinLength || saving}
          className="rounded-md bg-stone-800 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          {saving
            ? t("agent.saving")
            : hasKey
              ? t("agent.apiKeyUpdate")
              : t("agent.apiKeySave")}
        </button>
      </div>
      {hasKey && (
        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={12} weight="fill" />
            {t("agent.apiKeyStored")}
          </span>
          <button
            onClick={() => void remove()}
            className="text-[12px] text-tertiary underline-offset-2 hover:text-rose-600 hover:underline dark:hover:text-rose-400"
          >
            {t("agent.apiKeyRemove")}
          </button>
        </div>
      )}
    </div>
  );
}

function ProviderRow({
  providerId,
  provider,
  onLoginTypeChange,
}: {
  providerId: ProviderId;
  provider: Provider;
  onLoginTypeChange: (next: LoginType) => void;
}) {
  const { t } = useTranslation();
  const meta = PROVIDERS[providerId];
  const Icon = PROVIDER_ICONS[providerId];
  const loginOptions: SelectOption<LoginType>[] = [
    { value: "subscription", label: t(`provider.${providerId}.subscriptionLabel`) },
    { value: "api-key", label: t("agent.ownApiKey") },
  ];

  return (
    <SettingsGroup>
      <SettingsRow
        label={
          <span className="flex items-center gap-3">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-md ${PROVIDER_ICON_BG[providerId]}`}
            >
              <Icon size={16} />
            </span>
            {meta.name}
          </span>
        }
      >
        <SelectMenu
          value={provider.loginType}
          options={loginOptions}
          ariaLabel={meta.name}
          onChange={onLoginTypeChange}
          className={SETTINGS_SELECT}
        />
      </SettingsRow>
      {provider.loginType === "subscription" ? (
        <SubscriptionGuidance providerId={providerId} />
      ) : (
        <ApiKeyPanel providerId={providerId} hasKey={provider.apiKeyStored} />
      )}
    </SettingsGroup>
  );
}

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  fr: "Français",
};

function SidebarItem({
  active,
  onClick,
  buttonRef,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      tabIndex={active ? 0 : -1}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
        active
          ? "bg-surface-paper-muted text-primary"
          : "text-secondary hover:bg-surface-paper-muted/60 hover:text-primary"
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const providers = useChatStore((s) => s.providers);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const deleteAllHintId = useId();
  const deleteAllTitleId = useId();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [section, setSection] = useState<Section>("agents");
  const sectionButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const showSection = (id: Section) => {
    setSection(id);
    scroller.current?.scrollTo({ top: 0 });
  };
  const [startup, setStartup] = useState(getStartupPreference);
  const [primaryKeys, setPrimaryKeys] = useState(getPrimaryKeyPreference);
  const choosePrimaryKey = (dbType: DbType, kind: PrimaryKeyKind) => {
    const next = { ...primaryKeys, [dbType]: kind };
    setPrimaryKeys(next);
    void setPrimaryKeyPreference(next);
  };
  const themePreference = useThemeStore((s) => s.preference);
  const setThemePreference = useThemeStore((s) => s.setPreference);

  const handleLoginTypeChange = useCallback(
    (id: ProviderId, next: LoginType) => {
      const current = providers[id];
      const apiKeyStored = current?.apiKeyStored ?? false;
      persistProvider(id, makeProvider(id, next, apiKeyStored));
    },
    [providers],
  );

  const language = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";

  return (
    <Modal onClose={onClose} maxWidth="max-w-[820px]" dismissible={!confirmingDelete}>
      <div className="flex h-[min(36rem,calc(100vh-8rem))] overflow-hidden rounded-xl">
        <nav
          onKeyDown={(e) => {
            const index = SECTIONS.findIndex((s) => s.id === section);
            const next = arrowTarget(e.key, index, SECTIONS.length, "vertical");
            const target = next === null ? undefined : SECTIONS[next];
            if (next === null || !target) return;
            e.preventDefault();
            showSection(target.id);
            sectionButtons.current[next]?.focus();
          }}
          className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-paper px-3 pb-3 pt-4"
        >
          <h2 className="mb-1 flex h-7 items-center px-2.5 text-[13px] font-semibold text-primary">
            {t("settings.title")}
          </h2>
          {SECTIONS.map(({ id, Icon }, i) => (
            <SidebarItem
              key={id}
              active={section === id}
              onClick={() => showSection(id)}
              buttonRef={(el) => {
                sectionButtons.current[i] = el;
              }}
              icon={<Icon size={15} />}
            >
              {t(`settings.${id}`)}
            </SidebarItem>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-7 pb-1 pt-4">
            <h2 className="text-[15px] font-semibold text-primary">
              {t(`settings.${section}`)}
            </h2>
            <button
              onClick={onClose}
              className="-mr-2 rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
              aria-label={t("settings.close")}
            >
              <X size={16} />
            </button>
          </div>

          <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto px-7 pb-7 pt-4">
            <div className={section !== "agents" ? "hidden" : "space-y-4"}>
              {PROVIDER_IDS.map((id) => {
                const provider = providers[id] ?? makeProvider(id);
                return (
                  <ProviderRow
                    key={id}
                    providerId={id}
                    provider={provider}
                    onLoginTypeChange={(next) => handleLoginTypeChange(id, next)}
                  />
                );
              })}
            </div>

            <div className={section !== "conversations" ? "hidden" : ""}>
              <SettingsGroup>
                <SettingsRow
                  label={t("settings.deleteAllConversations")}
                  description={
                    isStreaming ? (
                      <span id={deleteAllHintId}>
                        {t("settings.deleteAllWhileAnswering")}
                      </span>
                    ) : (
                      t("settings.deleteAllDescription")
                    )
                  }
                >
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={isStreaming}
                    aria-describedby={isStreaming ? deleteAllHintId : undefined}
                    className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 disabled:hover:bg-transparent dark:text-red-400"
                  >
                    {t("settings.deleteAll")}
                  </button>
                </SettingsRow>
              </SettingsGroup>
              {/* Portalled: the settings dialog's fade-in transform would trap a
                fixed overlay inside it. */}
              {confirmingDelete &&
                createPortal(
                  <Modal
                    onClose={() => setConfirmingDelete(false)}
                    zIndex={60}
                    ariaLabelledBy={deleteAllTitleId}
                  >
                    <div className="p-6">
                      <h2
                        id={deleteAllTitleId}
                        className="text-base font-semibold text-primary"
                      >
                        {t("settings.deleteAllConfirm")}
                      </h2>
                      <div className="mt-6 flex justify-end gap-2">
                        <button
                          type="button"
                          autoFocus
                          onClick={() => setConfirmingDelete(false)}
                          className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-secondary transition-all hover:bg-surface-muted"
                        >
                          {t("settings.cancel")}
                        </button>
                        <button
                          type="button"
                          disabled={isStreaming}
                          onClick={() => {
                            useChatStore.getState().deleteAllConversations();
                            setConfirmingDelete(false);
                          }}
                          className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-red-600/90 active:scale-[0.98] disabled:opacity-50"
                        >
                          {t("settings.deleteAll")}
                        </button>
                      </div>
                    </div>
                  </Modal>,
                  document.body,
                )}
            </div>

            {section === "integrations" && <IntegrationsSection />}

            <div className={section !== "general" ? "hidden" : ""}>
              <SettingsGroup>
                <SettingsRow
                  label={t("settings.appearance")}
                  description={t(APPEARANCE_HINT_KEY)}
                >
                  <SegmentedControl
                    value={themePreference}
                    ariaLabel={t("settings.appearance")}
                    onChange={(value) => setThemePreference(value)}
                    options={ThemePreferenceZ.options.map((value) => {
                      const Icon = THEME_ICONS[value];
                      return {
                        value,
                        label: t(`theme.${value}`),
                        icon: <Icon size={14} />,
                      };
                    })}
                  />
                </SettingsRow>
                <SettingsRow
                  label={t("settings.startupTitle")}
                  description={t(`settings.startup.${startup}Hint`)}
                >
                  <SelectMenu
                    value={startup}
                    ariaLabel={t("settings.startupTitle")}
                    options={STARTUP_OPTIONS.map((value) => ({
                      value,
                      label: t(`settings.startup.${value}`),
                    }))}
                    onChange={(value) => {
                      setStartup(value);
                      void setStartupPreference(value);
                    }}
                    className={SETTINGS_SELECT}
                  />
                </SettingsRow>
                <SettingsRow label={t("settings.language")}>
                  <SelectMenu
                    value={language}
                    ariaLabel={t("settings.language")}
                    options={SUPPORTED_LANGUAGES.map((lang) => ({
                      value: lang,
                      label: LANGUAGE_LABELS[lang],
                    }))}
                    onChange={(lang) => void i18n.changeLanguage(lang)}
                    className={SETTINGS_SELECT}
                  />
                </SettingsRow>
              </SettingsGroup>
              <div className="mt-6">
                <SettingsGroup title={t("settings.newTables")}>
                  {PRIMARY_KEY_DBS.map(({ dbType, labelKey }) => (
                    <SettingsRow
                      key={dbType}
                      label={t(labelKey)}
                      description={
                        <code className="select-text font-mono text-[11.5px]">
                          {idColumnSql(dbType, primaryKeys[dbType])}
                        </code>
                      }
                    >
                      <SelectMenu
                        value={primaryKeys[dbType]}
                        ariaLabel={t(labelKey)}
                        options={PrimaryKeyKindZ.options.map((kind) => ({
                          value: kind,
                          label: t(`settings.primaryKey.${kind}`),
                        }))}
                        onChange={(kind) => choosePrimaryKey(dbType, kind)}
                        className={SETTINGS_SELECT}
                      />
                    </SettingsRow>
                  ))}
                </SettingsGroup>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
