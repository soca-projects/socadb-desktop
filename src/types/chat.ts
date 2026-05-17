import { IS_WINDOWS } from "../utils/platform";

export type ProviderId = "claude" | "codex";

export type ConnectionMethod = "subscription" | "api-key";

export interface Provider {
  id: ProviderId;
  name: string;
  connected: boolean;
  connectionMethod: ConnectionMethod | null;
  email: string | null;
}

export interface SupportedModel {
  id: string;
  displayName: string;
  description: string;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  models: SupportedModel[];
  apiKeyPlaceholder: string;
  apiKeyMinLength: number;
  consoleUrl: string;
  cliName: string;
  installCommand: string;
  startCommand: string;
  loginCommand: string;
  logoutCommand: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Anthropic",
    models: [
      {
        id: "claude-opus-4-7",
        displayName: "Claude Opus 4.7",
        description: "Most capable",
      },
      {
        id: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        description: "Fast, balanced",
      },
      { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", description: "Fastest" },
    ],
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://console.anthropic.com/settings/keys",
    cliName: "Claude Code",
    // PowerShell on native Windows (most common shell on Win11), bash on
    // macOS/Linux/WSL. The CMD variant from the docs is omitted to avoid
    // overloading the modal; PowerShell users dominate and CMD users can
    // copy from claude.ai/install if needed.
    installCommand: IS_WINDOWS
      ? "irm https://claude.ai/install.ps1 | iex"
      : "curl -fsSL https://claude.ai/install.sh | bash",
    startCommand: "claude",
    loginCommand: "claude /login",
    logoutCommand: "claude /logout",
  },
  codex: {
    id: "codex",
    name: "OpenAI",
    models: [
      { id: "gpt-5.5", displayName: "GPT 5.5", description: "Most capable" },
      { id: "gpt-5.4", displayName: "GPT 5.4", description: "Fast, balanced" },
      { id: "gpt-5.4-mini", displayName: "GPT 5.4 Mini", description: "Fastest" },
    ],
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://platform.openai.com/settings/organization/api-keys",
    cliName: "Codex",
    installCommand: "npm install -g @openai/codex",
    startCommand: "codex",
    loginCommand: "codex auth login",
    logoutCommand: "codex auth logout",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function getProviderFromModel(modelId: string): ProviderId {
  return modelId.startsWith("gpt-") ? "codex" : "claude";
}

export function makeProvider(
  id: ProviderId,
  connected: boolean,
  connectionMethod: ConnectionMethod | null,
  email: string | null,
): Provider {
  return { id, name: PROVIDERS[id].name, connected, connectionMethod, email };
}

export function getAvailableModels(
  providers: Record<string, Provider>,
): SupportedModel[] {
  return PROVIDER_IDS.flatMap((id) =>
    providers[id]?.connected ? PROVIDERS[id].models : [],
  );
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

// Per-model effort support, sourced from official docs:
//   https://platform.claude.com/docs/en/docs/build-with-claude/effort
//   https://developers.openai.com/api/docs/guides/reasoning
// Empty list = the model does not accept the effort parameter at all.
export const EFFORT_LEVELS_BY_MODEL: Record<string, readonly EffortLevel[]> = {
  "claude-opus-4-7": ["low", "medium", "high", "xhigh", "max"],
  "claude-sonnet-4-6": ["low", "medium", "high", "max"],
  "claude-haiku-4-5": [],
  "gpt-5.5": ["low", "medium", "high", "xhigh"],
  "gpt-5.4": ["low", "medium", "high", "xhigh"],
  "gpt-5.4-mini": ["low", "medium", "high"],
};

export const EFFORT_LEVELS_BY_PROVIDER: Record<ProviderId, EffortLevel[]> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["low", "medium", "high", "xhigh"],
};

export const DEFAULT_EFFORT_BY_PROVIDER: Record<ProviderId, EffortLevel> = {
  claude: "medium",
  codex: "medium",
};

export function getEffortLevelsForModel(modelId: string): readonly EffortLevel[] {
  return EFFORT_LEVELS_BY_MODEL[modelId] ?? [];
}

export function modelSupportsEffort(modelId: string): boolean {
  return getEffortLevelsForModel(modelId).length > 0;
}

export interface ResolvedEffort {
  displayed: EffortLevel;
  toSend: EffortLevel | undefined;
}

export function resolveEffort(
  modelId: string,
  storedEffort: EffortLevel,
  providerId: ProviderId,
): ResolvedEffort {
  const supported = getEffortLevelsForModel(modelId);
  const displayed = supported.includes(storedEffort)
    ? storedEffort
    : DEFAULT_EFFORT_BY_PROVIDER[providerId];
  const toSend = supported.length > 0 ? displayed : undefined;
  return { displayed, toSend };
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: string | null;
  isSuccess: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCallInfo[];
  timestamp: string;
}

export interface Conversation {
  id: string;
  name: string;
  sessionId: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatStatusResult {
  loggedIn: boolean;
  email: string | null;
  loginType: ConnectionMethod | null;
}

export interface ChatEvent {
  type: "chat_event" | "chat_status_result" | "ready";
  event?: string;
  [key: string]: unknown;
}
