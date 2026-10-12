import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { handleChatEvent } from "../utils/chatEventHandler";
import type { ChatEvent } from "../types/chat";
import { logError } from "../utils/log";

export function useChatStream() {
  useEffect(() => {
    let cancelled = false;

    const unlistenPromise = listen<{ raw: string }>("chat-stream", (event) => {
      if (cancelled) return;
      try {
        const parsed = JSON.parse(event.payload.raw) as ChatEvent;
        handleChatEvent(parsed);
      } catch (e) {
        logError("chat.stream.parse_failed", e);
      }
    });

    return () => {
      cancelled = true;
      void unlistenPromise.then((fn) => fn());
    };
  }, []);
}
