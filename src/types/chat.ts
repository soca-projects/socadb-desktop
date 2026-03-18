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
