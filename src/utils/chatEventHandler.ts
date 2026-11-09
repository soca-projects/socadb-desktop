import { z } from "zod";
import { useChatStore } from "../stores/chatStore";
import type { ChatEvent, ProviderId } from "../types/chat";
import { PROVIDERS } from "../types/chat";
import { ChatErrorZ } from "./zodSchemas";
import { resetAgent } from "./chatCommands";
import { authErrorText, chatSendErrorText, modelUnavailableText } from "./chatErrors";
import { escapeMarkdown } from "./chatMarkdown";
import i18next from "../i18n";
import { maskQuoted } from "./logPrivacy";
import { logWarn } from "./log";

const ContentBlocksZ = z.array(
  z.object({ type: z.string(), text: z.string().optional() }),
);

function toolResultText(output: unknown): string {
  if (typeof output === "string") return output;
  const blocks = ContentBlocksZ.safeParse(output);
  const texts = blocks.success
    ? blocks.data.flatMap((b) =>
        b.type === "text" && b.text !== undefined ? [b.text] : [],
      )
    : [];
  return texts.length > 0 ? texts.join("\n") : JSON.stringify(output ?? "");
}

function ensureAssistantMessage() {
  const store = useChatStore.getState();
  const last = store.messages[store.messages.length - 1];
  if (!last || last.role !== "assistant") {
    store.startAssistantMessage();
  }
}

// An error ends the turn, not the conversation: dropping the session here
// would make the next message start over without the agent's memory.
function endFailedTurn() {
  const store = useChatStore.getState();
  store.finishResponse(store.sessionId ?? "");
}

export function handleChatSendFailure(providerId: ProviderId, error: unknown) {
  useChatStore.getState().setAssistantError(chatSendErrorText(providerId, error));
  endFailedTurn();
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

    case "tool_result": {
      if (isStale) break;
      const interrupted = parsed.interrupted === true;
      store.updateLastToolCall(
        parsed.toolUseId as string,
        interrupted ? "" : toolResultText(parsed.output),
        !(parsed.isError as boolean),
        interrupted,
      );
      break;
    }

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
        // Runner errors can quote raw agent events (Codex dumps its output):
        // the release log keeps their shape, not their content.
        logWarn("agent.turn.error", maskQuoted(errorMsg).slice(0, 300), {
          provider: providerId,
          code: errorParse.success ? errorParse.data.code : undefined,
        });

        if (errorParse.success && errorParse.data.code === "auth") {
          store.setAssistantError(authErrorText(providerId, store.providers[providerId]));
        } else if (errorParse.success && errorParse.data.code === "model_unavailable") {
          store.setAssistantError(
            modelUnavailableText(errorParse.data.model ?? store.selectedModel),
          );
        } else if (lower.includes("credit balance")) {
          store.setAssistantError(
            i18next.t("chatError.creditBalance", {
              message: escapeMarkdown(errorMsg),
              consoleName: i18next.t(`provider.${providerId}.consoleName`),
              consoleUrl: meta.consoleUrl,
            }),
          );
          resetAgent(providerId);
        } else {
          store.setAssistantError(
            i18next.t("chatError.generic", { message: escapeMarkdown(errorMsg) }),
          );
        }
      }
      endFailedTurn();
      break;
    }
  }
}
