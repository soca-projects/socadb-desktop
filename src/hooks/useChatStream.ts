import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../stores/chatStore";

interface StreamEvent {
  raw: string;
}

interface DoneEvent {
  session_id: string | null;
}

interface ErrorEvent {
  error: string;
}

function ensureAssistantMessage() {
  const store = useChatStore.getState();
  const last = store.messages[store.messages.length - 1];
  if (!last || last.role !== "assistant") {
    store.startAssistantMessage();
  }
}

export function useChatStream() {
  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    function registerListener<T>(
      event: string,
      handler: (event: { payload: T }) => void,
    ) {
      listen<T>(event, (e) => {
        if (!cancelled) handler(e);
      }).then((fn) => {
        if (cancelled) fn();
        else unlisteners.push(fn);
      });
    }

    registerListener<StreamEvent>("chat-stream", (event) => {
      const { raw } = event.payload;

      try {
        const parsed = JSON.parse(raw);
        console.log("[chat-stream]", parsed.type, parsed);

        if (parsed.type === "assistant" && parsed.message?.content) {
          ensureAssistantMessage();

          let text = "";
          const toolCalls: {
            id: string;
            name: string;
            input: Record<string, unknown>;
            result: string | null;
            isSuccess: boolean;
          }[] = [];

          for (const block of parsed.message.content) {
            if (block.type === "text") {
              text += block.text;
            }

            if (block.type === "tool_use") {
              toolCalls.push({
                id: block.id ?? "",
                name: block.name,
                input: block.input ?? {},
                result: null,
                isSuccess: false,
              });
            }

            if (block.type === "tool_result") {
              const tc = toolCalls.find((t) => t.id === block.tool_use_id);
              if (tc) {
                tc.result =
                  typeof block.content === "string"
                    ? block.content
                    : JSON.stringify(block.content);
                tc.isSuccess = !block.is_error;
              }
            }
          }

          if (text) {
            useChatStore.getState().setAssistantText(text);
          }

          const existing = useChatStore.getState().messages;
          const lastMsg = existing[existing.length - 1];
          if (lastMsg?.role === "assistant" && toolCalls.length > 0) {
            const merged = toolCalls.map((tc) => {
              const prev = lastMsg.toolCalls.find((p) => p.id === tc.id);
              if (prev?.result && !tc.result) {
                return { ...tc, result: prev.result, isSuccess: prev.isSuccess };
              }
              return tc;
            });
            useChatStore.getState().setToolCalls(merged);
          }
        }

        if (parsed.type === "user" && parsed.message?.content) {
          const store = useChatStore.getState();
          const msgs = store.messages;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.toolCalls.length > 0) {
            const updated = lastMsg.toolCalls.map((tc) => {
              const result = parsed.message.content.find(
                (b: { type: string; tool_use_id?: string }) =>
                  b.type === "tool_result" && b.tool_use_id === tc.id,
              );
              if (result) {
                return {
                  ...tc,
                  result:
                    typeof result.content === "string"
                      ? result.content
                      : JSON.stringify(result.content ?? ""),
                  isSuccess: !result.is_error,
                };
              }
              return tc;
            });
            store.setToolCalls(updated);
          }
        }

        if (parsed.type === "result") {
          const last =
            useChatStore.getState().messages[useChatStore.getState().messages.length - 1];
          if (!last || last.role !== "assistant" || !last.content) {
            ensureAssistantMessage();
            if (parsed.result) {
              useChatStore.getState().setAssistantText(parsed.result);
            }
          }
          if (parsed.session_id) {
            useChatStore.getState().finishResponse(parsed.session_id);
          }
        }
      } catch {
        // Not valid JSON or unexpected format — ignore
      }
    });

    registerListener<DoneEvent>("chat-done", (event) => {
      console.log("[chat-done]", event.payload);
      useChatStore.getState().finishResponse(event.payload.session_id ?? "");
    });

    registerListener<ErrorEvent>("chat-error", (event) => {
      console.log("[chat-error]", event.payload);
      ensureAssistantMessage();
      useChatStore.getState().appendAssistantText(`Error: ${event.payload.error}`);
      useChatStore.getState().finishResponse("");
    });

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);
}
