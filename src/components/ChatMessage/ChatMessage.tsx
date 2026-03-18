import { memo } from "react";
import { ChatToolCall } from "../ChatToolCall/ChatToolCall";
import type { ChatMessage as ChatMessageType } from "../../types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser ? "bg-accent text-white" : "bg-surface-muted text-stone-700"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content.trim()}</div>

        {message.toolCalls.length > 0 && (
          <div className="mt-2 border-t border-stone-200/50 pt-1.5">
            {message.toolCalls.map((tc, i) => (
              <ChatToolCall key={tc.id || `${tc.name}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
