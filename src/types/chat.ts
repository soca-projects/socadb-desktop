import { IS_WINDOWS } from "../utils/platform";

export type ProviderId = "claude" | "codex";

export type LoginType = "subscription" | "api-key";

export interface Provider {
  id: ProviderId;
  name: string;
  loginType: LoginType;
  apiKeyStored: boolean;
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
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    name: "Anthropic",
    models: [
      {
        id: "claude-fable-5-1",
        displayName: "Claude Fable 5.1",
        description: "Most capable",
      },
      { id: "claude-opus-5-5", displayName: "Claude Opus 5.5", description: "Powerful" },
      {
        id: "claude-sonnet-5",
        displayName: "Claude Sonnet 5",
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
  },
  codex: {
    id: "codex",
    name: "OpenAI",
    models: [
      { id: "gpt-6-astra", displayName: "GPT-6 Astra", description: "Most capable" },
      { id: "gpt-6-sol", displayName: "GPT-6 Sol", description: "Fast, balanced" },
      { id: "gpt-6-luna", displayName: "GPT-6 Luna", description: "Fastest" },
    ],
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://platform.openai.com/settings/organization/api-keys",
    cliName: "Codex",
    installCommand: "npm install -g @openai/codex",
    startCommand: "codex",
    loginCommand: "codex login",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function getProviderFromModel(modelId: string): ProviderId {
  return modelId.startsWith("gpt-") ? "codex" : "claude";
}

export function makeProvider(
  id: ProviderId,
  loginType: LoginType = "subscription",
  apiKeyStored = false,
): Provider {
  return { id, name: PROVIDERS[id].name, loginType, apiKeyStored };
}

export function getAvailableModels(): SupportedModel[] {
  return PROVIDER_IDS.flatMap((id) => PROVIDERS[id].models);
}

export function getModelDisplayName(id: string): string | undefined {
  return getAvailableModels().find((m) => m.id === id)?.displayName;
}

export const DEFAULT_MODEL = "claude-sonnet-5";

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  claude: DEFAULT_MODEL,
  codex: "gpt-6-sol",
};

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

// Per-model effort support, sourced from official docs:
//   https://platform.claude.com/docs/en/docs/build-with-claude/effort
//   https://learn.chatgpt.com/docs/models
// Empty list = the model does not accept the effort parameter at all.
export const EFFORT_LEVELS_BY_MODEL: Record<string, readonly EffortLevel[]> = {
  "claude-fable-5-1": ["low", "medium", "high", "xhigh", "max"],
  "claude-opus-5-5": ["low", "medium", "high", "xhigh", "max"],
  "claude-sonnet-5": ["low", "medium", "high", "xhigh", "max"],
  "claude-haiku-4-5": [],
  "gpt-6-astra": ["low", "medium", "high", "xhigh", "max"],
  "gpt-6-sol": ["low", "medium", "high", "xhigh", "max"],
  "gpt-6-luna": ["low", "medium", "high", "xhigh", "max"],
};

export const EFFORT_LEVELS_BY_PROVIDER: Record<ProviderId, EffortLevel[]> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["low", "medium", "high", "xhigh", "max"],
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

export function isEmptyMessage(message: ChatMessage): boolean {
  return !message.content.trim() && message.toolCalls.length === 0;
}

export interface Conversation {
  id: string;
  name: string;
  nameEdited?: boolean;
  provider?: ProviderId;
  model?: string;
  sessionId: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatEvent {
  type: "chat_event" | "ready";
  event?: string;
  [key: string]: unknown;
}
