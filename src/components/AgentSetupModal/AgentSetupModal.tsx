import { useState, useCallback } from "react";
import {
  XIcon as X,
  CheckCircleIcon as CheckCircle,
  ArrowClockwiseIcon as ArrowClockwise,
} from "@phosphor-icons/react";
import { useChatStore } from "../../stores/chatStore";
import { detectClaudeCode } from "../../utils/providerDetection";
import { saveProviderConfig } from "../../utils/chatPersistence";

interface AgentSetupModalProps {
  onClose: () => void;
}

async function runDetection(
  setChecking: (v: boolean) => void,
  setStatus: (v: {
    installed: boolean;
    authenticated: boolean;
    email: string | null;
  }) => void,
  setProvider: (p: {
    id: "claude-code";
    name: string;
    connected: boolean;
    connectionMethod: "subscription";
    email: string | null;
  }) => void,
) {
  setChecking(true);
  const result = await detectClaudeCode();
  setStatus(result);
  if (result.authenticated) {
    const p = {
      id: "claude-code" as const,
      name: "Anthropic Claude Code",
      connected: true,
      connectionMethod: "subscription" as const,
      email: result.email,
    };
    setProvider(p);
    void saveProviderConfig(p);
  }
  setChecking(false);
}

export function AgentSetupModal({ onClose }: AgentSetupModalProps) {
  const provider = useChatStore((s) => s.provider);
  const setProvider = useChatStore((s) => s.setProvider);

  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<{
    installed: boolean;
    authenticated: boolean;
    email: string | null;
  } | null>(null);
  useState(() => {
    void runDetection(setChecking, setStatus, setProvider);
  });

  const checkProvider = useCallback(() => {
    void runDetection(setChecking, setStatus, setProvider);
  }, [setProvider]);

  const isConnected = provider?.connected ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="w-full max-w-md animate-fade-in rounded-xl border border-border bg-surface shadow-float">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-primary">Setup Agents</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-4 text-[13px] font-medium text-secondary">Agents on Canvas</p>

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-[14px]">
                  ⬡
                </div>
                <div>
                  <p className="text-[13px] font-medium text-secondary">
                    Anthropic Claude Code
                  </p>
                  {isConnected ? (
                    <p className="flex items-center gap-1 text-[12px] text-emerald-600">
                      <CheckCircle size={12} weight="fill" />
                      Connected{provider?.email ? ` (${provider.email})` : ""}
                    </p>
                  ) : status && !status.installed ? (
                    <p className="text-[12px] text-tertiary">Not installed</p>
                  ) : status && !status.authenticated ? (
                    <p className="text-[12px] text-tertiary">Not authenticated</p>
                  ) : (
                    <p className="text-[12px] text-tertiary">Checking...</p>
                  )}
                </div>
              </div>

              {!isConnected && (
                <button
                  onClick={() => void checkProvider()}
                  disabled={checking}
                  className="rounded-md px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-light disabled:opacity-50"
                >
                  <ArrowClockwise size={13} className={checking ? "animate-spin" : ""} />
                </button>
              )}
            </div>

            {!isConnected && status && (
              <div className="mt-4 rounded-lg bg-surface-muted p-3">
                {!status.installed ? (
                  <div className="space-y-2 text-[12px] text-secondary">
                    <p className="font-medium">Install Claude Code</p>
                    <code className="block rounded bg-surface px-2 py-1.5 font-mono text-[11px] text-tertiary">
                      curl -fsSL https://claude.ai/install.sh | bash
                    </code>
                    <p className="mt-2 font-medium">Then sign in</p>
                    <code className="block rounded bg-surface px-2 py-1.5 font-mono text-[11px] text-tertiary">
                      claude
                    </code>
                  </div>
                ) : (
                  <div className="space-y-2 text-[12px] text-secondary">
                    <p className="font-medium">Sign in with your Claude subscription</p>
                    <p>Run in your terminal:</p>
                    <code className="block rounded bg-surface px-2 py-1.5 font-mono text-[11px] text-tertiary">
                      claude
                    </code>
                    <p className="text-tertiary">
                      Select "Claude account with subscription" and sign in. SocaDB will
                      detect the connection automatically.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
