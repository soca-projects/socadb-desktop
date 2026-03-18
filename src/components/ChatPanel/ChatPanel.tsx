import { useRef, useEffect, useCallback, useState } from "react";
import {
  XIcon as X,
  ArrowsOutIcon as ArrowsOut,
  ChatCircleIcon as ChatCircle,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "../../stores/chatStore";
import { useSchemaStore } from "../../stores/schemaStore";
import { ChatMessage } from "../ChatMessage/ChatMessage";
import { ChatInput } from "../ChatInput/ChatInput";
import {
  CHAT_PANEL_MIN_WIDTH,
  CHAT_PANEL_MIN_HEIGHT,
  CHAT_PANEL_MAX_WIDTH,
  CHAT_PANEL_MAX_HEIGHT,
  CHAT_PANEL_DEFAULT_WIDTH,
  CHAT_PANEL_DEFAULT_HEIGHT,
} from "../../utils/layout";

function buildSystemPrompt(): string {
  const { schema } = useSchemaStore.getState();

  const serialized = {
    name: schema.name,
    dbType: schema.dbType,
    tables: schema.tables.map((t) => ({
      name: t.name,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        isPrimaryKey: c.isPrimaryKey,
        isNullable: c.isNullable,
        isUnique: c.isUnique,
      })),
    })),
    relations: schema.relations.map((r) => {
      const fromTable = schema.tables.find((t) => t.id === r.from.tableId);
      const toTable = schema.tables.find((t) => t.id === r.to.tableId);
      const fromCol = fromTable?.columns.find((c) => c.id === r.from.columnId);
      const toCol = toTable?.columns.find((c) => c.id === r.to.columnId);
      return {
        type: r.type,
        from: `${fromTable?.name}.${fromCol?.name}`,
        to: `${toTable?.name}.${toCol?.name}`,
      };
    }),
  };

  return `You are a database schema design assistant in SocaDB.

## Context
- Database: ${schema.dbType}
- Schema: "${schema.name}"
- Tables: ${schema.tables.length}

## Current schema
${JSON.stringify(serialized, null, 2)}

## Rules
- Use the SocaDB MCP tools to modify the schema (create_table, add_column, create_relation, etc.)
- Respect the dbType and use compatible column types
- After creating or modifying multiple tables, call auto_layout to reorganize the canvas
- Answer in the user's language
- Be concise`;
}

export function ChatPanel() {
  const isPanelOpen = useChatStore((s) => s.isPanelOpen);
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sessionId = useChatStore((s) => s.sessionId);
  const provider = useChatStore((s) => s.provider);
  const togglePanel = useChatStore((s) => s.togglePanel);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useChatStore((s) => s.startAssistantMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: CHAT_PANEL_DEFAULT_WIDTH,
    height: CHAT_PANEL_DEFAULT_HEIGHT,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    (content: string) => {
      if (!isPanelOpen) togglePanel();
      addUserMessage(content);
      startAssistantMessage();

      const systemPrompt = buildSystemPrompt();

      void invoke("chat_send", {
        message: content,
        systemPrompt,
        sessionId: sessionId ?? undefined,
      });
    },
    [addUserMessage, startAssistantMessage, sessionId, isPanelOpen, togglePanel],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width;
      const startH = size.height;

      const onMove = (ev: MouseEvent) => {
        const dw = startX - ev.clientX;
        const dh = startY - ev.clientY;
        setSize({
          width: Math.min(
            Math.max(startW + dw, CHAT_PANEL_MIN_WIDTH),
            CHAT_PANEL_MAX_WIDTH,
          ),
          height: Math.min(
            Math.max(startH + dh, CHAT_PANEL_MIN_HEIGHT),
            CHAT_PANEL_MAX_HEIGHT,
          ),
        });
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size],
  );

  const isConnected = provider?.connected ?? false;

  if (!isPanelOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex w-[340px] items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-card transition-shadow hover:shadow-float">
        <ChatCircle size={16} className="flex-shrink-0 text-stone-400" />
        <input
          type="text"
          placeholder={
            isConnected
              ? "Ask AI to modify your schema..."
              : "Connect a provider to start..."
          }
          disabled={!isConnected}
          readOnly={!isConnected}
          className="flex-1 bg-transparent text-[13px] text-stone-700 placeholder-stone-400 outline-none disabled:opacity-50"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => togglePanel()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const val = (e.target as HTMLInputElement).value.trim();
              if (val) {
                handleSend(val);
                (e.target as HTMLInputElement).value = "";
              }
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 right-4 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-float animate-fade-in"
      style={{ width: size.width, height: size.height }}
    >
      <div
        className="absolute left-0 top-0 cursor-nw-resize p-1"
        onMouseDown={handleResizeStart}
      >
        <ArrowsOut size={12} className="rotate-90 text-stone-300" />
      </div>

      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[13px] font-medium text-stone-700">AI Chat</span>
        <button
          onClick={togglePanel}
          className="rounded p-1 text-stone-400 transition-colors hover:bg-surface-muted hover:text-stone-600"
          aria-label="Close chat"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-[13px] text-stone-400">
              {isConnected
                ? "What do you want to build?"
                : "Connect a provider in Settings to start."}
            </p>
            {isConnected && (
              <div className="flex flex-col items-center gap-2">
                {[
                  "Complete e-commerce schema with 10 tables",
                  "Add a users table with auth fields",
                  "Schema for a Spotify-like music app",
                  "Explain my current schema and suggest improvements",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="rounded-full border border-border px-3.5 py-1.5 text-[12px] text-stone-500 transition-colors hover:border-stone-300 hover:bg-surface-muted hover:text-stone-700"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput onSend={handleSend} disabled={isStreaming || !isConnected} />
    </div>
  );
}
