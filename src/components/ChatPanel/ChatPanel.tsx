import { useRef, useEffect, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  XIcon as X,
  CaretDownIcon as CaretDown,
  PlusIcon as Plus,
  PaperPlaneRightIcon as PaperPlaneRight,
} from "@phosphor-icons/react";
import { useChatStore } from "../../stores/chatStore";
import { sendChatMessage, stopChat, initChat } from "../../utils/chatCommands";
import { useSchemaStore } from "../../stores/schemaStore";
import { serializeRelation } from "../../utils/schemaQueries";
import {
  DEFAULT_MODEL,
  getAvailableModels,
  getProviderFromModel,
} from "../../types/chat";
import { useFocusStore } from "../../stores/focusStore";
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

  const tables = schema.tables.map((t) => {
    const cols = t.columns.map((c) => c.name).join(", ");
    return `- ${t.name} (${t.columns.length} cols: ${cols})`;
  });

  const relations = schema.relations.map((r) => {
    const sr = serializeRelation(schema, r);
    return `- ${sr.from.table}.${sr.from.column} → ${sr.to.table}.${sr.to.column} (${sr.type})`;
  });

  return `You are a database schema design assistant in SocaDB.

## Context
- Database: ${schema.dbType}
- Schema: "${schema.name}"
- Tables: ${schema.tables.length}
${tables.length > 0 ? "\n" + tables.join("\n") : ""}
${relations.length > 0 ? "\n## Relations\n" + relations.join("\n") : ""}

## Rules
- Use the SocaDB MCP tools to modify the schema (create_table, add_column, create_relation, etc.)
- Use get_table to inspect column details (types, constraints) before modifying a table
- Respect the dbType and use compatible column types
- After creating or modifying multiple tables, call auto_layout to reorganize the canvas
- Answer in the user's language
- Be concise`;
}

type ResizeAxis = "both" | "vertical" | "horizontal";

function useResize(initial: { width: number; height: number }) {
  const [size, setSize] = useState(initial);

  const startResize = useCallback(
    (e: React.MouseEvent, axis: ResizeAxis) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.width;
      const startH = size.height;

      const cursorMap: Record<ResizeAxis, string> = {
        both: "nwse-resize",
        vertical: "ns-resize",
        horizontal: "ew-resize",
      };
      document.body.style.cursor = cursorMap[axis];
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        const dw = axis !== "vertical" ? startX - ev.clientX : 0;
        const dh = axis !== "horizontal" ? startY - ev.clientY : 0;
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
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size],
  );

  return { size, startResize };
}

export function ChatPanel() {
  const { t } = useTranslation();
  const isPanelOpen = useChatStore((s) => s.isPanelOpen);
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sessionId = useChatStore((s) => s.sessionId);
  const providers = useChatStore((s) => s.providers);
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const togglePanel = useChatStore((s) => s.togglePanel);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const startAssistantMessage = useChatStore((s) => s.startAssistantMessage);
  const newConversation = useChatStore((s) => s.newConversation);
  const switchConversation = useChatStore((s) => s.switchConversation);

  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { size, startResize } = useResize({
    width: CHAT_PANEL_DEFAULT_WIDTH,
    height: CHAT_PANEL_DEFAULT_HEIGHT,
  });
  const focusMode = useFocusStore((s) => s.focusMode);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const availableModels = getAvailableModels(providers);
  const isConnected = availableModels.length > 0;
  const activeProviderId = getProviderFromModel(selectedModel);

  useEffect(() => {
    if (isPanelOpen) {
      void initChat(activeProviderId);
    }
  }, [isPanelOpen, activeProviderId]);

  const handleSend = useCallback(
    async (content: string) => {
      if (isStreaming) return;
      if (!isPanelOpen) togglePanel();
      addUserMessage(content);
      startAssistantMessage();

      const systemPrompt = buildSystemPrompt();
      try {
        await sendChatMessage(
          content,
          systemPrompt,
          activeProviderId,
          sessionId ?? undefined,
          selectedModel,
        );
      } catch (e) {
        const store = useChatStore.getState();
        const msg = e instanceof Error ? e.message : String(e);
        store.appendAssistantText(msg);
        store.finishResponse("");
      }
    },
    [
      addUserMessage,
      startAssistantMessage,
      sessionId,
      isPanelOpen,
      togglePanel,
      isStreaming,
      selectedModel,
      activeProviderId,
    ],
  );

  const handleStop = useCallback(() => {
    stopChat(activeProviderId);
  }, [activeProviderId]);

  if (focusMode) return null;

  if (!isPanelOpen) {
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const convName =
      activeConv && activeConv.messages.length > 0
        ? activeConv.name
        : t("chat.newConversation");
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex w-[340px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card transition-shadow hover:shadow-float cursor-pointer"
        onClick={togglePanel}
      >
        <div className="border-b border-border px-3 py-1.5">
          <span className="block truncate text-[11px] font-medium text-tertiary">
            {convName}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="flex-1 text-[13px] text-tertiary">
            {isConnected ? t("chat.askAi") : t("chat.connectProvider")}
          </span>
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white opacity-40">
            <PaperPlaneRight size={12} weight="fill" />
          </div>
        </div>
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
        className="absolute left-3 right-0 top-0 z-10 h-1.5 cursor-ns-resize"
        onMouseDown={(e) => startResize(e, "vertical")}
      />
      <div
        className="absolute bottom-0 left-0 top-3 z-10 w-1.5 cursor-ew-resize"
        onMouseDown={(e) => startResize(e, "horizontal")}
      />
      <div
        className="absolute left-0 top-0 z-20 h-3 w-3 cursor-nwse-resize"
        onMouseDown={(e) => startResize(e, "both")}
      />

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <select
            value={activeConversationId ?? ""}
            onChange={(e) => switchConversation(e.target.value)}
            disabled={isStreaming || conversations.length <= 1}
            className="w-full appearance-none truncate rounded-md border border-border bg-surface-muted py-1 pl-2.5 pr-6 text-[12px] font-medium text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent disabled:opacity-50"
          >
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <CaretDown
            size={10}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-tertiary"
          />
        </div>
        <div className="relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming}
            className="appearance-none rounded-md border border-border bg-surface-muted py-1 pl-2.5 pr-6 text-[12px] font-medium text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent disabled:opacity-50"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
          <CaretDown
            size={10}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-tertiary"
          />
        </div>
        <button
          onClick={newConversation}
          disabled={isStreaming}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary disabled:opacity-50 disabled:pointer-events-none"
          aria-label={t("chat.newChat")}
        >
          <Plus size={14} />
        </button>
        <button
          onClick={togglePanel}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
          aria-label={t("chat.closeChat")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-[13px] text-tertiary">
              {isConnected ? t("chat.whatToBuild") : t("chat.connectInSettings")}
            </p>
            {isConnected && (
              <div className="flex flex-col items-center gap-2">
                {[
                  t("chat.suggestion1"),
                  t("chat.suggestion2"),
                  t("chat.suggestion3"),
                  t("chat.suggestion4"),
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="rounded-full border border-border px-3.5 py-1.5 text-[12px] text-tertiary transition-colors hover:border-border-hover hover:bg-surface-muted hover:text-secondary"
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

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        disabled={!isConnected}
        isStreaming={isStreaming}
      />
    </div>
  );
}
