import { useChatStore } from "../stores/chatStore";
import type { ChatStatusResult, ChatEvent, ProviderId } from "../types/chat";
import { makeProvider, PROVIDERS } from "../types/chat";
import { ChatStatusResultZ, ChatErrorZ } from "./zodSchemas";
import { resetAgent } from "./chatCommands";
import i18next from "../i18n";

let nextRequestId = 1;

const statusResolvers = new Map<
  number,
  {
    providerId: string;
    resolve: (result: ChatStatusResult) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

export function registerStatusResolver(
  providerId: string,
  resolve: (result: ChatStatusResult) => void,
  timeout: ReturnType<typeof setTimeout>,
): number {
  const id = nextRequestId++;
  statusResolvers.set(id, { providerId, resolve, timeout });
  return id;
}

export function removeStatusResolver(requestId: number) {
  const resolver = statusResolvers.get(requestId);
  if (resolver) {
    clearTimeout(resolver.timeout);
    statusResolvers.delete(requestId);
  }
}

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
    for (const [id, resolver] of statusResolvers) {
      if (resolver.providerId === pid) {
        clearTimeout(resolver.timeout);
        statusResolvers.delete(id);
        resolver.resolve(result);
        break;
      }
    }
    return;
  }

  if (parsed.type !== "chat_event") return;

  const store = useChatStore.getState();
  const isStale =
    store.streamingConversationId != null &&
    store.streamingConversationId !== store.activeConversationId;

  switch (parsed.event) {
    case "session_init":
      if (!isStale) store.setSessionId((parsed.sessionId as string) ?? null);
      break;

    case "text_delta":
      if (isStale) break;
      ensureAssistantMessage();
      store.appendAssistantText(parsed.text as string);
      break;

    case "tool_use":
      if (isStale) break;
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
      if (isStale) break;
      store.updateLastToolCall(
        parsed.toolUseId as string,
        typeof parsed.output === "string"
          ? parsed.output
          : JSON.stringify(parsed.output ?? ""),
        !(parsed.isError as boolean),
      );
      break;

    case "done":
      if (!isStale && parsed.response) {
        ensureAssistantMessage();
        store.setAssistantText(parsed.response as string);
      }
      store.finishResponse((parsed.sessionId as string) ?? "");
      break;

    case "error": {
      if (!isStale) {
        ensureAssistantMessage();
        const errorParse = ChatErrorZ.safeParse(parsed);
        const errorMsg = errorParse.success ? errorParse.data.message : "Unknown error";
        const lower = errorMsg.toLowerCase();
        const providerId = (parsed.providerId as ProviderId) ?? "claude";
        const meta = PROVIDERS[providerId];

        if (lower.includes("not logged in")) {
          store.appendAssistantText(
            i18next.t("chatError.generic", { message: errorMsg }),
          );
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
          store.appendAssistantText(
            i18next.t("chatError.generic", { message: errorMsg }),
          );
        }
      }
      store.finishResponse("");
      break;
    }
  }
}
