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
  consoleName: string;
  cliName: string;
  subscriptionLabel: string;
  signInHint: string;
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
        id: "claude-opus-4-6",
        displayName: "Claude Opus 4.6",
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
    consoleName: "Anthropic Console",
    cliName: "Claude Code",
    subscriptionLabel: "Claude Subscription (Pro, Max...)",
    signInHint: 'Select "Claude account with subscription" to sign in.',
    installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
    startCommand: "claude",
    loginCommand: "claude /login",
    logoutCommand: "claude /logout",
  },
  codex: {
    id: "codex",
    name: "OpenAI",
    models: [
      { id: "gpt-5.3-codex", displayName: "GPT 5.3 Codex", description: "Best" },
      { id: "gpt-5.4", displayName: "GPT 5.4", description: "Latest" },
      { id: "gpt-5.2-codex", displayName: "GPT 5.2 Codex", description: "Fast" },
    ],
    apiKeyPlaceholder: "sk-proj-...",
    apiKeyMinLength: 20,
    consoleUrl: "https://platform.openai.com/settings/organization/api-keys",
    consoleName: "OpenAI Dashboard",
    cliName: "Codex",
    subscriptionLabel: "ChatGPT Subscription (Plus, Pro...)",
    signInHint: "Sign in with your ChatGPT subscription.",
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
