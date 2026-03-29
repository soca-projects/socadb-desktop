import { memo } from "react";
import { ChatToolCall } from "../ChatToolCall/ChatToolCall";
import type { ChatMessage as ChatMessageType } from "../../types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 px-0.5 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-500"
          style={{
            animation: "thinking-pulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isEmpty = !message.content.trim() && message.toolCalls.length === 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser ? "bg-accent text-white" : "bg-surface-muted text-secondary"
        }`}
      >
        {isEmpty && !isUser ? (
          <ThinkingIndicator />
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content.trim()}</div>
        )}

        {message.toolCalls.length > 0 && (
          <div className="mt-2 border-t border-border-light pt-1.5">
            {message.toolCalls.map((tc, i) => (
              <ChatToolCall key={tc.id || `${tc.name}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
