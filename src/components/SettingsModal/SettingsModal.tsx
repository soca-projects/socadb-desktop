import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal/Modal";
import {
  XIcon as X,
  CheckCircleIcon as CheckCircle,
  ArrowClockwiseIcon as ArrowClockwise,
  CaretDownIcon as CaretDown,
  CopyIcon as Copy,
  CheckIcon as Check,
  KeyIcon as Key,
  SignOutIcon as SignOut,
  TerminalWindowIcon as TerminalWindow,
  RobotIcon as Robot,
  GlobeIcon as Globe,
} from "@phosphor-icons/react";
import { useChatStore } from "../../stores/chatStore";
import { ClaudeIcon } from "../../assets/icons/ClaudeIcon";
import { CodexIcon } from "../../assets/icons/CodexIcon";
import { detectProvider } from "../../utils/providerDetection";
import { persistProvider, saveApiKey, clearApiKey } from "../../utils/chatPersistence";
import { setApiKey as setApiKeyOnAgent } from "../../utils/chatCommands";
import { useClickOutside } from "../../hooks/useClickOutside";
import {
  makeProvider,
  PROVIDERS,
  PROVIDER_IDS,
  type ProviderId,
  type Provider,
} from "../../types/chat";
import { SUPPORTED_LANGUAGES, type Language } from "../../i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

type Section = "agents" | "language";
type AgentView = "main" | "subscription" | "api-key";

interface SettingsModalProps {
  onClose: () => void;
}

function ModalShell({
  title,
  onClose,
  maxWidth = "max-w-md",
  children,
}: {
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onClose} dismissible={false} maxWidth={maxWidth}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
          aria-label={t("settings.close")}
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </Modal>
  );
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

function SignInDropdown({
  providerId,
  onSubscription,
  onApiKey,
}: {
  providerId: ProviderId;
  onSubscription: () => void;
  onApiKey: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-primary/90 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        {t("agent.signInWith")}
        <CaretDown size={11} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-56 rounded-lg bg-surface py-1 shadow-float">
          <button
            onClick={() => {
              setOpen(false);
              onSubscription();
            }}
            className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-surface-muted"
          >
            <span className="text-[12px] font-medium text-primary">
              {t(`provider.${providerId}.subscriptionLabel`)}
            </span>
            <span className="text-[11px] text-tertiary">
              {t("agent.subscriptionIncluded")}
            </span>
          </button>
          <div className="mx-3 my-1 border-t border-border" />
          <button
            onClick={() => {
              setOpen(false);
              onApiKey();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
          >
            <Key size={13} className="text-tertiary" />
            <span className="text-[12px] text-secondary">{t("agent.ownApiKey")}</span>
          </button>
        </div>
      )}
    </div>
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

function ProviderRow({
  providerId,
  provider,
  onSubscription,
  onApiKey,
  onDisconnect,
}: {
  providerId: ProviderId;
  provider: Provider | undefined;
  onSubscription: () => void;
  onApiKey: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation();
  const isConnected = provider?.connected ?? false;
  const [checking, setChecking] = useState(false);
  const meta = PROVIDERS[providerId];
  const Icon = PROVIDER_ICONS[providerId];

  const runDetection = useCallback(async () => {
    const wasConnected =
      useChatStore.getState().providers[providerId]?.connected ?? false;
    if (!wasConnected) setChecking(true);
    const result = await detectProvider(providerId);
    if (result.authenticated) {
      persistProvider(
        providerId,
        makeProvider(
          providerId,
          true,
          result.loginType === "api-key" ? "api-key" : "subscription",
          result.email,
        ),
      );
    } else if (
      wasConnected &&
      useChatStore.getState().providers[providerId]?.connectionMethod === "subscription"
    ) {
      const confirm = await detectProvider(providerId);
      if (!confirm.authenticated) {
        persistProvider(providerId, makeProvider(providerId, false, null, null));
      }
    }
    setChecking(false);
  }, [providerId]);

  useEffect(() => {
    void runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => void runDetection(), 5000);
    return () => clearInterval(interval);
  }, [isConnected, runDetection]);

  return (
    <div className="rounded-lg border border-border px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${PROVIDER_ICON_BG[providerId]}`}
          >
            <Icon size={18} />
          </div>
          <div>
            <p className="text-[13px] font-medium text-secondary">{meta.name}</p>
            {isConnected ? (
              <p className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={12} weight="fill" />
                {provider?.email
                  ? t("agent.connectedViaEmail", {
                      method: provider?.connectionMethod ?? "subscription",
                      email: provider.email,
                    })
                  : t("agent.connectedVia", {
                      method: provider?.connectionMethod ?? "subscription",
                    })}
              </p>
            ) : checking ? (
              <p className="text-[12px] text-tertiary">{t("agent.checking")}</p>
            ) : (
              <p className="text-[12px] text-tertiary">{t("agent.notConnected")}</p>
            )}
          </div>
        </div>

        {isConnected && provider?.connectionMethod === "api-key" && (
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted hover:text-primary"
          >
            <SignOut size={13} />
            {t("agent.disconnect")}
          </button>
        )}

        {!isConnected && !checking && (
          <SignInDropdown
            providerId={providerId}
            onSubscription={onSubscription}
            onApiKey={onApiKey}
          />
        )}

        {!isConnected && checking && (
          <ArrowClockwise size={14} className="animate-spin text-tertiary" />
        )}
      </div>

      {isConnected && provider?.connectionMethod === "subscription" && (
        <p className="mt-3 text-[11px] text-tertiary">
          {t("agent.switchToApiKey")}{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
            {meta.logoutCommand}
          </code>{" "}
          {t("agent.switchToApiKeyEnd")}
        </p>
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
  const [agentView, setAgentView] = useState<AgentView>("main");
  const [activeProviderId, setActiveProviderId] = useState<ProviderId>("claude");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [connecting, setConnecting] = useState(false);

  const activeMeta = PROVIDERS[activeProviderId];

  const connectWithApiKey = useCallback(async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setConnecting(true);
    await saveApiKey(activeProviderId, key);
    setApiKeyOnAgent(activeProviderId, key);
    persistProvider(
      activeProviderId,
      makeProvider(activeProviderId, true, "api-key", null),
    );
    setConnecting(false);
    setAgentView("main");
    setApiKeyInput("");
  }, [apiKeyInput, activeProviderId]);

  const disconnect = useCallback(async (id: ProviderId) => {
    await clearApiKey(id);
    setApiKeyOnAgent(id, null);
    persistProvider(id, makeProvider(id, false, null, null));
  }, []);

  if (agentView === "subscription") {
    return (
      <ModalShell
        title={t("agent.signInTitle", {
          label: t(`provider.${activeProviderId}.subscriptionLabel`),
        })}
        onClose={() => setAgentView("main")}
        maxWidth="max-w-lg"
      >
        <div className="p-5">
          <p className="mb-3 text-[13px] text-secondary">{t("agent.terminalSteps")}</p>
          <button
            onClick={() => void invoke("open_terminal")}
            className="mb-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-primary/90 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            <TerminalWindow size={15} />
            {t("agent.openTerminal")}
          </button>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[12px] font-semibold text-primary">
                {t("agent.stepInstall", { name: activeMeta.cliName })}
              </p>
              <CopyableCommand>{activeMeta.installCommand}</CopyableCommand>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-primary">
                {t("agent.stepSignIn", { name: activeMeta.cliName })}
              </p>
              <CopyableCommand>{activeMeta.startCommand}</CopyableCommand>
              <p className="mt-1.5 text-[11px] text-tertiary">
                {t(`provider.${activeProviderId}.signInHint`)}
              </p>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-primary">
                {t("agent.stepLogin")}
              </p>
              <CopyableCommand>{activeMeta.loginCommand}</CopyableCommand>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2.5">
            <ArrowClockwise
              size={13}
              className={
                providers[activeProviderId]?.connected
                  ? "text-emerald-500"
                  : "animate-spin text-accent"
              }
            />
            <p className="text-[11px] text-tertiary">
              {providers[activeProviderId]?.connected
                ? t("agent.connectionDetected")
                : t("agent.detectingConnection")}
            </p>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (agentView === "api-key") {
    return (
      <ModalShell
        title={t("agent.apiKeyTitle")}
        onClose={() => {
          setAgentView("main");
          setApiKeyInput("");
        }}
      >
        <div className="p-5">
          <p className="mb-4 text-[13px] text-secondary">
            {t("agent.apiKeyGetFrom")}{" "}
            <button
              type="button"
              onClick={() => void openUrl(activeMeta.consoleUrl)}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              {t(`provider.${activeProviderId}.consoleName`)}
            </button>
            .
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder={activeMeta.apiKeyPlaceholder}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void connectWithApiKey();
              }}
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12px] text-primary placeholder:text-tertiary/50 focus:border-accent focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => void connectWithApiKey()}
              disabled={
                apiKeyInput.trim().length < activeMeta.apiKeyMinLength || connecting
              }
              className="rounded-md bg-primary px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
            >
              {connecting ? t("agent.connecting") : t("agent.connect")}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

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
            {PROVIDER_IDS.map((id) => (
              <ProviderRow
                key={id}
                providerId={id}
                provider={providers[id]}
                onSubscription={() => {
                  setActiveProviderId(id);
                  setAgentView("subscription");
                }}
                onApiKey={() => {
                  setActiveProviderId(id);
                  setAgentView("api-key");
                }}
                onDisconnect={() => void disconnect(id)}
              />
            ))}
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
