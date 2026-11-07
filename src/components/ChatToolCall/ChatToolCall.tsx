import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as WarningCircle,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import type { ToolCallInfo } from "../../types/chat";
import { toolCallLabel } from "../../utils/toolCallLabel";

interface ChatToolCallProps {
  toolCall: ToolCallInfo;
}

export function ChatToolCall({ toolCall }: ChatToolCallProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isPending = toolCall.result === null;
  const label = toolCallLabel(toolCall, t);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex max-w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] text-tertiary transition-colors hover:bg-surface-muted"
      >
        {isPending ? (
          <span
            role="img"
            aria-label={t("chat.toolRunning")}
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-[var(--color-fg-muted)] border-t-[var(--color-fg-tertiary)]"
          />
        ) : toolCall.isSuccess ? (
          <CheckCircle
            size={14}
            weight="fill"
            role="img"
            aria-label={t("chat.toolDone")}
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <WarningCircle
            size={14}
            weight="fill"
            role="img"
            aria-label={t("chat.toolFailed")}
            className="shrink-0 text-red-500 dark:text-red-400"
          />
        )}
        <span title={label} className="min-w-0 truncate">
          {label}
        </span>
        <CaretRight
          size={10}
          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <pre className="ml-5 mt-1 max-h-32 select-text overflow-auto whitespace-pre-wrap break-words rounded bg-surface-muted px-2 py-1.5 font-mono text-[11px] text-tertiary">
          {JSON.stringify(toolCall.input, null, 2)}
          {toolCall.result && (
            <>
              {"\n→ "}
              {toolCall.result}
            </>
          )}
        </pre>
      )}
    </div>
  );
}
