import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as WarningCircle,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import type { ToolCallInfo } from "../../types/chat";

function stripMcpPrefix(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}

interface ChatToolCallProps {
  toolCall: ToolCallInfo;
}

function formatToolLabel(toolCall: ToolCallInfo, t: (key: string) => string): string {
  const toolName = stripMcpPrefix(toolCall.name);
  const key = `toolCall.${toolName}`;
  const label = t(key) !== key ? t(key) : toolName;
  const name = (toolCall.input.name as string) ?? (toolCall.input.table as string) ?? "";
  return name ? `${label} "${name}"` : label;
}

export function ChatToolCall({ toolCall }: ChatToolCallProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isPending = toolCall.result === null;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] text-tertiary transition-colors hover:bg-surface-muted"
      >
        {isPending ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-[var(--color-fg-muted)] border-t-[var(--color-fg-tertiary)]" />
        ) : toolCall.isSuccess ? (
          <CheckCircle
            size={14}
            weight="fill"
            className="text-emerald-600 dark:text-emerald-400"
          />
        ) : (
          <WarningCircle
            size={14}
            weight="fill"
            className="text-red-500 dark:text-red-400"
          />
        )}
        <span>{formatToolLabel(toolCall, t)}</span>
        <CaretRight
          size={10}
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <pre className="ml-5 mt-1 max-h-32 overflow-auto rounded bg-surface-muted px-2 py-1.5 font-mono text-[11px] text-tertiary">
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
