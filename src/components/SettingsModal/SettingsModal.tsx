import { useState, useCallback, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal/Modal";
import {
  XIcon as X,
  CheckCircleIcon as CheckCircle,
  CaretDownIcon as CaretDown,
  CopyIcon as Copy,
  CheckIcon as Check,
  TerminalWindowIcon as TerminalWindow,
  RobotIcon as Robot,
  GlobeIcon as Globe,
} from "@phosphor-icons/react";
import { useChatStore } from "../../stores/chatStore";
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
import { SUPPORTED_LANGUAGES, type Language } from "../../i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

type Section = "agents" | "language";

interface SettingsModalProps {
  onClose: () => void;
}

function CopyableCommand({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <button
      onClick={copy}
      className="flex w-full items-center justify-between rounded-md bg-surface px-3 py-2 text-left font-mono text-[11px] text-tertiary transition-colors hover:bg-surface-muted dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600/70"
    >
      <span>{children}</span>
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-500" />
      ) : (
        <Copy size={12} className="shrink-0" />
      )}
    </button>
  );
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
  const [open, setOpen] = useState(false);
  const meta = PROVIDERS[providerId];

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-tertiary underline-offset-2 hover:text-secondary hover:underline"
      >
        {open
          ? t("agent.hideSetupSteps", { name: meta.cliName })
          : t("agent.showSetupSteps", { name: meta.cliName })}
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-md bg-surface-muted px-3 py-3">
          <button
            onClick={() => void invoke("open_terminal")}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-primary/90 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            <TerminalWindow size={13} />
            {t("agent.openTerminal")}
          </button>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-secondary">
              {t("agent.stepInstall", { name: meta.cliName })}
            </p>
            <CopyableCommand>{meta.installCommand}</CopyableCommand>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-secondary">
              {t("agent.stepSignIn", { name: meta.cliName })}
            </p>
            <CopyableCommand>{meta.startCommand}</CopyableCommand>
            <p className="mt-1 text-[10px] text-tertiary">
              {t(`provider.${providerId}.signInHint`)}
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-secondary">
              {t("agent.stepLogin")}
            </p>
            <CopyableCommand>{meta.loginCommand}</CopyableCommand>
          </div>
        </div>
      )}
    </div>
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
    <div className="mt-3 space-y-2 rounded-md bg-surface-muted px-3 py-3">
      <p className="text-[11px] text-tertiary">
        {t("agent.apiKeyGetFrom")}{" "}
        <button
          type="button"
          onClick={() => void openUrl(meta.consoleUrl)}
          className="font-medium text-accent underline-offset-2 hover:underline"
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
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-primary placeholder:text-tertiary/50 focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => void save()}
          disabled={input.trim().length < meta.apiKeyMinLength || saving}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
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
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle size={11} weight="fill" />
            {t("agent.apiKeyStored")}
          </span>
          <button
            onClick={() => void remove()}
            className="text-[11px] text-tertiary underline-offset-2 hover:text-rose-600 hover:underline dark:hover:text-rose-400"
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

  return (
    <div className="rounded-lg border border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${PROVIDER_ICON_BG[providerId]}`}
          >
            <Icon size={18} />
          </div>
          <p className="text-[13px] font-medium text-secondary">{meta.name}</p>
        </div>

        <div className="relative">
          <select
            value={provider.loginType}
            onChange={(e) => onLoginTypeChange(e.target.value as LoginType)}
            className="appearance-none rounded-md border border-border bg-surface py-1.5 pl-3 pr-7 text-[12px] font-medium text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent"
          >
            <option value="subscription">
              {t(`provider.${providerId}.subscriptionLabel`)}
            </option>
            <option value="api-key">{t("agent.ownApiKey")}</option>
          </select>
          <CaretDown
            size={11}
            weight="bold"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-tertiary"
          />
        </div>
      </div>

      {provider.loginType === "subscription" ? (
        <SubscriptionGuidance providerId={providerId} />
      ) : (
        <ApiKeyPanel providerId={providerId} hasKey={provider.apiKeyStored} />
      )}
    </div>
  );
}

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  fr: "Français",
};

function SidebarItem({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "border-l-2 border-accent bg-accent/[0.05] pl-[10px] text-accent"
          : "border-l-2 border-transparent pl-[10px] text-tertiary hover:bg-surface-muted hover:text-secondary"
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

  const [section, setSection] = useState<Section>("agents");

  const handleLoginTypeChange = useCallback(
    (id: ProviderId, next: LoginType) => {
      const current = providers[id];
      const apiKeyStored = current?.apiKeyStored ?? false;
      persistProvider(id, makeProvider(id, next, apiKeyStored));
    },
    [providers],
  );

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-semibold text-primary">{t("settings.title")}</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
          aria-label={t("settings.close")}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex">
        <div className="w-44 shrink-0 space-y-0.5 border-r border-border p-3">
          <SidebarItem
            active={section === "agents"}
            onClick={() => setSection("agents")}
            icon={<Robot size={15} />}
          >
            {t("settings.agents")}
          </SidebarItem>
          <SidebarItem
            active={section === "language"}
            onClick={() => setSection("language")}
            icon={<Globe size={15} />}
          >
            {t("settings.language")}
          </SidebarItem>
        </div>

        <div className="min-h-[280px] flex-1 p-6">
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

          <div className={section !== "language" ? "hidden" : ""}>
            <p className="mb-4 text-[13px] text-tertiary">
              {t("settings.languageDescription")}
            </p>
            <div className="space-y-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => void i18n.changeLanguage(lang)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-[13px] font-medium transition-all ${
                    i18n.resolvedLanguage === lang
                      ? "border-accent bg-accent/[0.05] text-accent"
                      : "border-border text-secondary hover:border-border-hover hover:bg-surface-muted"
                  }`}
                >
                  {LANGUAGE_LABELS[lang]}
                  {i18n.resolvedLanguage === lang && (
                    <CheckCircle size={16} weight="fill" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
