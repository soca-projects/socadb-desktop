import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import {
  XIcon as X,
  CheckCircleIcon as CheckCircle,
  ArrowClockwiseIcon as ArrowClockwise,
  CaretDownIcon as CaretDown,
  CopyIcon as Copy,
  CheckIcon as Check,
  KeyIcon as Key,
  SignOutIcon as SignOut,
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
import { openUrl } from "@tauri-apps/plugin-opener";

type View = "main" | "subscription" | "api-key";

interface AgentSetupModalProps {
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div
        className={`w-full ${maxWidth} animate-fade-in rounded-xl border border-border bg-surface shadow-float`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const meta = PROVIDERS[providerId];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-primary/90 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        Sign in with...
        <CaretDown size={11} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1.5 w-56 rounded-lg border border-border bg-surface py-1 shadow-float">
          <button
            onClick={() => {
              setOpen(false);
              onSubscription();
            }}
            className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-surface-muted"
          >
            <span className="text-[12px] font-medium text-primary">
              {meta.subscriptionLabel}
            </span>
            <span className="text-[11px] text-tertiary">
              Usage included with your plan
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
            <span className="text-[12px] text-secondary">Provide your own API key</span>
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

  useState(() => {
    void runDetection();
  });

  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => void runDetection(), 5000);
    return () => clearInterval(interval);
  }, [isConnected, runDetection]);

  return (
    <div className="rounded-lg border border-border p-4">
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
                Connected via {provider?.connectionMethod ?? "subscription"}
                {provider?.email ? ` (${provider.email})` : ""}
              </p>
            ) : checking ? (
              <p className="text-[12px] text-tertiary">Checking...</p>
            ) : (
              <p className="text-[12px] text-tertiary">Not connected</p>
            )}
          </div>
        </div>

        {isConnected && provider?.connectionMethod === "api-key" && (
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted hover:text-primary"
          >
            <SignOut size={13} />
            Disconnect
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
          To switch to API key, run{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
            {meta.logoutCommand}
          </code>{" "}
          in your terminal.
        </p>
      )}
    </div>
  );
}

export function AgentSetupModal({ onClose }: AgentSetupModalProps) {
  const providers = useChatStore((s) => s.providers);

  const [view, setView] = useState<View>("main");
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
    setView("main");
    setApiKeyInput("");
  }, [apiKeyInput, activeProviderId]);

  const disconnect = useCallback(async (id: ProviderId) => {
    await clearApiKey(id);
    setApiKeyOnAgent(id, null);
    persistProvider(id, makeProvider(id, false, null, null));
  }, []);

  if (view === "subscription") {
    return (
      <ModalShell
        title={`Sign in with ${activeProviderId === "claude" ? "Claude" : "ChatGPT"} subscription`}
        onClose={() => setView("main")}
        maxWidth="max-w-lg"
      >
        <div className="p-5">
          <p className="mb-5 text-[13px] text-secondary">
            Run these steps in your terminal.
          </p>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[12px] font-semibold text-primary">
                1. Install {activeProviderId === "claude" ? "Claude Code" : "Codex"} (if
                needed)
              </p>
              <CopyableCommand>{activeMeta.installCommand}</CopyableCommand>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-primary">
                2. Start {activeProviderId === "claude" ? "Claude Code" : "Codex"} and
                sign in
              </p>
              <CopyableCommand>{activeMeta.startCommand}</CopyableCommand>
              <p className="mt-1.5 text-[11px] text-tertiary">
                {activeProviderId === "claude"
                  ? 'Select "Claude account with subscription" to sign in.'
                  : "Sign in with your ChatGPT subscription."}
              </p>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-primary">
                3. Or login manually
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
                ? "Connection detected!"
                : "SocaDB will detect your connection automatically..."}
            </p>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (view === "api-key") {
    return (
      <ModalShell
        title="Connect with API key"
        onClose={() => {
          setView("main");
          setApiKeyInput("");
        }}
      >
        <div className="p-5">
          <p className="mb-4 text-[13px] text-secondary">
            Get your API key from the{" "}
            <button
              type="button"
              onClick={() => void openUrl(activeMeta.consoleUrl)}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              {activeMeta.consoleName}
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
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Setup Agents" onClose={onClose}>
      <div className="p-5">
        <p className="mb-4 text-[13px] font-medium text-secondary">Agents on Canvas</p>

        <div className="space-y-3">
          {PROVIDER_IDS.map((id) => (
            <ProviderRow
              key={id}
              providerId={id}
              provider={providers[id]}
              onSubscription={() => {
                setActiveProviderId(id);
                setView("subscription");
              }}
              onApiKey={() => {
                setActiveProviderId(id);
                setView("api-key");
              }}
              onDisconnect={() => void disconnect(id)}
            />
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
