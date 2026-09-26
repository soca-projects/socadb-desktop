import { invoke } from "@tauri-apps/api/core";
import type { EffortLevel, LoginType, ProviderId } from "../types/chat";
import { DEFAULT_MODEL } from "../types/chat";

export interface SendChatMessageInput {
  message: string;
  systemPrompt: string;
  providerId: ProviderId;
  loginType: LoginType;
  sessionId?: string;
  model?: string;
  effort?: EffortLevel;
}

export function sendChatMessage(input: SendChatMessageInput): Promise<void> {
  return invoke("chat_send", {
    providerId: input.providerId,
    loginType: input.loginType,
    message: input.message,
    systemPrompt: input.systemPrompt,
    sessionId: input.sessionId ?? null,
    model: input.model ?? DEFAULT_MODEL,
    effort: input.effort ?? null,
  }) as Promise<void>;
}

export function stopChat(providerId: ProviderId) {
  void invoke("chat_stop", { providerId });
}

// Fire-and-forget preheat: pays the spawn cost ahead of the first send.
export function initChat(providerId: ProviderId, loginType: LoginType) {
  // chat_send reports the same failure when the user actually sends.
  invoke("chat_init", { providerId, loginType }).catch(() => undefined);
}

export function resetAgent(providerId: ProviderId) {
  void invoke("chat_reset", { providerId });
}
