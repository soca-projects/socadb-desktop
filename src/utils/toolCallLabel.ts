import type { ToolCallInfo } from "../types/chat";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function columnName(column: unknown): string | undefined {
  if (column && typeof column === "object" && "name" in column) return text(column.name);
  return text(column);
}

function dotted(table: unknown, column: unknown): string | undefined {
  const t = text(table);
  const c = columnName(column);
  return t && c ? `${t}.${c}` : undefined;
}

function target(tool: string, input: Record<string, unknown>): string | undefined {
  switch (tool) {
    case "add_column":
    case "update_column":
    case "delete_column":
      return dotted(input.table, input.column);
    case "add_index": {
      const { columns } = input;
      const listed =
        Array.isArray(columns) && columns.every((c): c is string => typeof c === "string")
          ? columns.join(", ")
          : undefined;
      const table = text(input.table);
      return text(input.name) ?? (table && listed ? `${table} (${listed})` : undefined);
    }
    case "create_relation":
    case "delete_relation": {
      const from = dotted(input.fromTable, input.fromColumn);
      const to = dotted(input.toTable, input.toColumn);
      return from && to ? `${from} → ${to}` : undefined;
    }
    case "WebSearch":
      return text(input.query);
    case "WebFetch":
      return text(input.url);
    default:
      return text(input.name) ?? text(input.table);
  }
}

export function toolCallLabel(
  toolCall: ToolCallInfo,
  t: (key: string) => string,
): string {
  const tool = toolCall.name.replace(/^mcp__[^_]+__/, "");
  const key = `toolCall.${tool}`;
  const label = t(key) !== key ? t(key) : tool;
  const what = target(tool, toolCall.input);
  return what ? `${label} "${what}"` : label;
}
