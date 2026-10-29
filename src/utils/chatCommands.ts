import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "../stores/chatStore";
import type { EffortLevel, LoginType, ProviderId } from "../types/chat";
import { DEFAULT_MODEL, PROVIDER_IDS } from "../types/chat";
import { logWarn } from "./log";

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
  invoke("chat_init", { providerId, loginType }).catch((e: unknown) =>
    logWarn("agent.init.failed", e, { provider: providerId }),
  );
}

export function resetAgent(providerId: ProviderId) {
  void invoke("chat_reset", { providerId });
}

export async function stopAllAgents() {
  await Promise.all(
    PROVIDER_IDS.map((providerId) => invoke("chat_reset", { providerId })),
  );
  // A reset agent sends no end of turn: the chat would stay streaming.
  const chat = useChatStore.getState();
  if (chat.isStreaming) chat.finishResponse(chat.sessionId ?? "");
}
