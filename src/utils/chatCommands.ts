import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "../stores/chatStore";
import type { ChatStatusResult, ChatEvent } from "../types/chat";
import { DEFAULT_MODEL } from "../types/chat";

let statusResolve: ((result: ChatStatusResult) => void) | null = null;

function ensureAssistantMessage() {
  const store = useChatStore.getState();
  const last = store.messages[store.messages.length - 1];
  if (!last || last.role !== "assistant") {
    store.startAssistantMessage();
  }
}

export function handleChatEvent(parsed: ChatEvent) {
  if (parsed.type === "chat_status_result") {
    const store = useChatStore.getState();
    const provider = {
      id: "claude-code" as const,
      name: "Claude Code",
      connected: parsed.loggedIn as boolean,
      connectionMethod: (parsed.loginType as "subscription" | "api-key") ?? null,
      email: (parsed.email as string) ?? null,
    };
    store.setProvider(provider);
    if (statusResolve) {
      statusResolve({
        loggedIn: provider.connected,
        email: provider.email,
        loginType: provider.connectionMethod,
      });
      statusResolve = null;
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

    case "error":
      ensureAssistantMessage();
      store.appendAssistantText(`Error: ${parsed.message as string}`);
      store.finishResponse("");
      break;
  }
}

export function sendChatMessage(
  message: string,
  systemPrompt: string,
  sessionId?: string,
  model?: string,
) {
  void invoke("chat_send", {
    message,
    systemPrompt,
    sessionId: sessionId ?? null,
    model: model ?? DEFAULT_MODEL,
  });
}

export function stopChat() {
  void invoke("chat_stop");
}

function requestStatus(command: string): Promise<ChatStatusResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      statusResolve = null;
      reject(new Error("Status check timed out"));
    }, 10000);

    statusResolve = (result) => {
      clearTimeout(timeout);
      resolve(result);
    };

    void invoke(command);
  });
}

export function initChat(): Promise<ChatStatusResult> {
  return requestStatus("chat_init");
}

export function checkChatStatus(): Promise<ChatStatusResult> {
  return requestStatus("chat_status");
}
