import { useState } from "react";
import {
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as WarningCircle,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import type { ToolCallInfo } from "../../types/chat";

const TOOL_LABELS: Record<string, string> = {
  create_table: "created table",
  update_table: "renamed table",
  delete_table: "deleted table",
  add_column: "added column",
  update_column: "updated column",
  delete_column: "deleted column",
  create_relation: "created relation",
  delete_relation: "deleted relation",
  auto_layout: "auto layout applied",
  get_schema: "read schema",
  get_table: "read table",
  get_editor_state: "read editor state",
};

function stripMcpPrefix(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}

function formatToolLabel(toolCall: ToolCallInfo): string {
  const toolName = stripMcpPrefix(toolCall.name);
  const label = TOOL_LABELS[toolName] ?? toolName;
  const name = (toolCall.input.name as string) ?? (toolCall.input.table as string) ?? "";
  return name ? `${label} "${name}"` : label;
}

interface ChatToolCallProps {
  toolCall: ToolCallInfo;
}

export function ChatToolCall({ toolCall }: ChatToolCallProps) {
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
          <CheckCircle size={14} weight="fill" className="text-emerald-500" />
        ) : (
          <WarningCircle size={14} weight="fill" className="text-red-400" />
        )}
        <span>{formatToolLabel(toolCall)}</span>
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
