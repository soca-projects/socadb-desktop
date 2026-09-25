import { invoke } from "@tauri-apps/api/core";
import type { ChatStatusResult, EffortLevel, ProviderId } from "../types/chat";
import { DEFAULT_MODEL } from "../types/chat";
import { registerStatusResolver, removeStatusResolver } from "./chatEventHandler";
import i18next from "../i18n";

export interface SendChatMessageInput {
  message: string;
  systemPrompt: string;
  providerId: ProviderId;
  sessionId?: string;
  model?: string;
  effort?: EffortLevel;
}

export function sendChatMessage(input: SendChatMessageInput): Promise<void> {
  return invoke("chat_send", {
    providerId: input.providerId,
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

function requestStatus(
  command: string,
  providerId: ProviderId,
): Promise<ChatStatusResult> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line prefer-const
    let requestId: number;
    const timeout = setTimeout(() => {
      removeStatusResolver(requestId);
      reject(new Error(i18next.t("chatError.statusTimeout")));
    }, 10000);

    requestId = registerStatusResolver(providerId, resolve, timeout);

    void invoke(command, { providerId });
  });
}

export function initChat(providerId: ProviderId): Promise<ChatStatusResult> {
  return requestStatus("chat_init", providerId);
}

export function checkChatStatus(providerId: ProviderId): Promise<ChatStatusResult> {
  return requestStatus("chat_status", providerId);
}

export function setApiKey(providerId: ProviderId, apiKey: string | null) {
  void invoke("chat_set_api_key", { providerId, apiKey });
}

export function resetAgent(providerId: ProviderId) {
  void invoke("chat_reset", { providerId });
}
