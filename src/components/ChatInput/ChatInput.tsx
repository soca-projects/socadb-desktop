import { useState, useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  PaperPlaneRightIcon as PaperPlaneRight,
  StopIcon as Stop,
} from "@phosphor-icons/react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  footer?: ReactNode;
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
  placeholder,
  footer,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="grid gap-2 border-t border-border p-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t("chat.askAi")}
        disabled={disabled}
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        rows={1}
        className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[13px] leading-[18px] text-secondary placeholder:text-tertiary outline-none transition-colors focus:border-accent disabled:opacity-50"
      />
      <div className="flex min-w-0 items-center gap-1.5">
        {footer}
        <span className="flex-1" />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-stone-500 text-white transition-colors hover:bg-stone-600 dark:bg-stone-400 dark:text-stone-900 dark:hover:bg-stone-300"
            aria-label={t("chat.stop")}
          >
            <Stop size={13} weight="fill" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            aria-label={t("chat.sendMessage")}
          >
            <PaperPlaneRight size={13} weight="fill" />
          </button>
        )}
      </div>
    </div>
  );
}
