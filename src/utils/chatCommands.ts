import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "../stores/chatStore";
import type { ChatStatusResult, ChatEvent, ProviderId } from "../types/chat";
import { DEFAULT_MODEL, makeProvider, PROVIDERS } from "../types/chat";
import { ChatStatusResultZ, ChatErrorZ } from "./zodSchemas";
import i18next from "../i18n";

const statusResolvers = new Map<
  string,
  { resolve: (result: ChatStatusResult) => void; timeout: ReturnType<typeof setTimeout> }
>();

function ensureAssistantMessage() {
  const store = useChatStore.getState();
  const last = store.messages[store.messages.length - 1];
  if (!last || last.role !== "assistant") {
    store.startAssistantMessage();
  }
}

export function handleChatEvent(parsed: ChatEvent) {
  if (parsed.type === "chat_status_result") {
    const parse = ChatStatusResultZ.safeParse(parsed);
    if (!parse.success) return;
    const result: ChatStatusResult = parse.data;
    const pid = (parsed.providerId as string) ?? "claude";
    const resolver = statusResolvers.get(pid);
    if (resolver) {
      clearTimeout(resolver.timeout);
      statusResolvers.delete(pid);
      resolver.resolve(result);
    }
    return;
  }

  if (parsed.type !== "chat_event") return;

  const store = useChatStore.getState();

  switch (parsed.event) {
    case "session_init":
      store.setSessionId((parsed.sessionId as string) ?? null);
      break;

    case "text_delta":
      ensureAssistantMessage();
      store.appendAssistantText(parsed.text as string);
      break;

    case "tool_use":
      ensureAssistantMessage();
      store.addToolCall({
        id: parsed.toolUseId as string,
        name: parsed.toolName as string,
        input: (parsed.toolInput as Record<string, unknown>) ?? {},
        result: null,
        isSuccess: false,
      });
      break;

    case "tool_result":
      store.updateLastToolCall(
        parsed.toolUseId as string,
        typeof parsed.output === "string"
          ? parsed.output
          : JSON.stringify(parsed.output ?? ""),
        !(parsed.isError as boolean),
      );
      break;

    case "done":
      if (parsed.response) {
        ensureAssistantMessage();
        store.setAssistantText(parsed.response as string);
      }
      store.finishResponse((parsed.sessionId as string) ?? "");
      break;

    case "error": {
      ensureAssistantMessage();
      const errorParse = ChatErrorZ.safeParse(parsed);
      const errorMsg = errorParse.success ? errorParse.data.message : "Unknown error";
      const lower = errorMsg.toLowerCase();
      const providerId = (parsed.providerId as ProviderId) ?? "claude";
      const meta = PROVIDERS[providerId];

      if (lower.includes("not logged in")) {
        store.appendAssistantText(i18next.t("chatError.generic", { message: errorMsg }));
        store.setProvider(providerId, makeProvider(providerId, false, null, null));
      } else if (lower.includes("credit balance")) {
        store.appendAssistantText(
          i18next.t("chatError.creditBalance", {
            message: errorMsg,
            consoleName: i18next.t(`provider.${providerId}.consoleName`),
            consoleUrl: meta.consoleUrl,
          }),
        );
        resetAgent(providerId);
      } else {
        store.appendAssistantText(i18next.t("chatError.generic", { message: errorMsg }));
      }
      store.finishResponse("");
      break;
    }
  }
}

export function sendChatMessage(
  message: string,
  systemPrompt: string,
  providerId: ProviderId,
  sessionId?: string,
  model?: string,
) {
  void invoke("chat_send", {
    providerId,
    message,
    systemPrompt,
    sessionId: sessionId ?? null,
    model: model ?? DEFAULT_MODEL,
  });
}

export function stopChat(providerId: ProviderId) {
  void invoke("chat_stop", { providerId });
}

function requestStatus(
  command: string,
  providerId: ProviderId,
): Promise<ChatStatusResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      statusResolvers.delete(providerId);
      reject(new Error(i18next.t("chatError.statusTimeout")));
    }, 10000);

    statusResolvers.set(providerId, { resolve, timeout });

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

function resetAgent(providerId: ProviderId) {
  void invoke("chat_reset", { providerId });
}
