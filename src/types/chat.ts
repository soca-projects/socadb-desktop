export type ProviderId = "claude-code";

export type ConnectionMethod = "subscription" | "api-key";

export interface Provider {
  id: ProviderId;
  name: string;
  connected: boolean;
  connectionMethod: ConnectionMethod | null;
  email: string | null;
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

export interface ChatStatusResult {
  loggedIn: boolean;
  email: string | null;
  loginType: ConnectionMethod | null;
}

export interface SupportedModel {
  id: string;
  displayName: string;
  description: string;
}

export const SUPPORTED_MODELS: SupportedModel[] = [
  { id: "claude-opus-4-6", displayName: "Claude Opus 4.6", description: "Most capable" },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    description: "Fast, balanced",
  },
  { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", description: "Fastest" },
];

export const DEFAULT_MODEL = "claude-sonnet-4-6";
