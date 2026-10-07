import { useChatStore } from "../stores/chatStore";
import type { ChatEvent, ProviderId } from "../types/chat";
import { PROVIDERS } from "../types/chat";
import { ChatErrorZ } from "./zodSchemas";
import { resetAgent } from "./chatCommands";
import { authErrorText, modelUnavailableText } from "./chatErrors";
import i18next from "../i18n";

function ensureAssistantMessage() {
  const store = useChatStore.getState();
  const last = store.messages[store.messages.length - 1];
  if (!last || last.role !== "assistant") {
    store.startAssistantMessage();
  }
}

export function handleChatEvent(parsed: ChatEvent) {
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

    case "memory_lost":
      if (isStale) break;
      ensureAssistantMessage();
      // Its own message: "done" replaces the text of the last one.
      store.setAssistantText(i18next.t("chat.memoryLost"));
      store.startAssistantMessage();
      break;

    case "done": {
      if (!isStale && parsed.response) {
        ensureAssistantMessage();
        store.setAssistantText(parsed.response as string);
      }
      // A stale answer belongs to another conversation, and a turn stopped before
      // its session started reports none: keep the conversation's own session then.
      const reported =
        !isStale && typeof parsed.sessionId === "string" ? parsed.sessionId : "";
      store.finishResponse(reported || (store.sessionId ?? ""));
      break;
    }

    case "error": {
      if (!isStale) {
        ensureAssistantMessage();
        const errorParse = ChatErrorZ.safeParse(parsed);
        const errorMsg = errorParse.success ? errorParse.data.message : "Unknown error";
        const lower = errorMsg.toLowerCase();
        const providerId = (parsed.providerId as ProviderId) ?? "claude";
        const meta = PROVIDERS[providerId];

        if (errorParse.success && errorParse.data.code === "auth") {
          store.appendAssistantText(
            authErrorText(providerId, store.providers[providerId]),
          );
        } else if (errorParse.success && errorParse.data.code === "model_unavailable") {
          store.appendAssistantText(
            modelUnavailableText(errorParse.data.model ?? store.selectedModel),
          );
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
      // An error ends the turn, not the conversation: dropping the session here
      // would make the next message start over without the agent's memory.
      store.finishResponse(store.sessionId ?? "");
      break;
    }
  }
}
