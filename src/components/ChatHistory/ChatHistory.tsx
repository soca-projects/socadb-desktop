import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  MagnifyingGlassIcon as MagnifyingGlass,
  PencilSimpleIcon as PencilSimple,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import { useChatStore } from "../../stores/chatStore";
import { getAvailableModels, type Conversation } from "../../types/chat";
import { groupConversations, historyGroup } from "../../utils/conversationHistory";

interface ChatHistoryProps {
  onOpen: () => void;
}

function formatWhen(updatedAt: string, now: Date, locale: string, t: TFunction): string {
  const date = new Date(updatedAt);
  switch (historyGroup(updatedAt, now)) {
    case "today":
      return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    case "yesterday":
      return t("chat.groups.yesterday");
    case "week":
      return date.toLocaleDateString(locale, { weekday: "long" });
    default:
      return date.toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
      });
  }
}

export function ChatHistory({ onOpen }: ChatHistoryProps) {
  const { t, i18n } = useTranslation();
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingId = useChatStore((s) => s.streamingConversationId);
  const switchConversation = useChatStore((s) => s.switchConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const renameCancelled = useRef(false);

  const now = new Date();
  const groups = useMemo(
    () => groupConversations(conversations, query, new Date()),
    [conversations, query],
  );
  const models = useMemo(() => getAvailableModels(), []);

  const open = (conversation: Conversation) => {
    if (isStreaming && conversation.id !== activeId) return;
    if (conversation.id !== activeId) switchConversation(conversation.id);
    onOpen();
  };

  const commitRename = (id: string, value: string) => {
    if (!renameCancelled.current) renameConversation(id, value);
    renameCancelled.current = false;
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col gap-0.5 px-2 pb-3 pt-2.5">
      <div className="relative mx-1 mb-1.5">
        <MagnifyingGlass
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary"
        />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setConfirmId(null);
          }}
          placeholder={t("chat.searchConversations")}
          aria-label={t("chat.searchConversations")}
          className="w-full rounded-md border border-border bg-surface-muted py-1.5 pl-7 pr-2.5 text-[12.5px] text-secondary outline-none transition-colors placeholder:text-tertiary focus:border-accent"
        />
      </div>

      {groups.length === 0 && (
        <p className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-tertiary">
          {query.trim()
            ? t("chat.noMatch", { query: query.trim() })
            : t("chat.noConversations")}
        </p>
      )}

      {groups.map(({ group, items }) => (
        <section key={group} className="flex flex-col gap-0.5">
          <h3 className="px-2 pb-1 pt-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-tertiary">
            {t(`chat.groups.${group}`)}
          </h3>
          {items.map((c) => {
            const isActive = c.id === activeId;
            const locked = isStreaming && !isActive;
            const model = models.find((m) => m.id === c.model)?.displayName;
            const when = formatWhen(c.updatedAt, now, i18n.language, t);

            if (confirmId === c.id) {
              return (
                <div
                  key={c.id}
                  role="group"
                  aria-label={t("chat.delete")}
                  className="grid gap-2 rounded-md border border-red-500/30 bg-red-500/[0.06] p-2 text-[12px] leading-snug text-secondary"
                >
                  <p>{t("chat.deleteConfirm", { name: c.name })}</p>
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted"
                    >
                      {t("chat.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteConversation(c.id);
                        setConfirmId(null);
                      }}
                      className="rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-red-700"
                    >
                      {t("chat.delete")}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={c.id}
                role="button"
                tabIndex={locked ? -1 : 0}
                aria-label={c.name}
                aria-current={isActive ? "true" : undefined}
                aria-disabled={locked || undefined}
                onClick={() => renamingId !== c.id && open(c)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(c);
                  }
                }}
                className={`group grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted ${
                  locked ? "cursor-default opacity-50" : "cursor-pointer"
                }`}
              >
                <div className="grid min-w-0 gap-px">
                  {renamingId === c.id ? (
                    <input
                      autoFocus
                      defaultValue={c.name}
                      aria-label={t("chat.renameLabel")}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => commitRename(c.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(c.id, e.currentTarget.value);
                        if (e.key === "Escape") {
                          renameCancelled.current = true;
                          setRenamingId(null);
                        }
                      }}
                      className="w-full rounded-[5px] border border-accent bg-surface px-1.5 py-0.5 text-[12.5px] text-primary outline-none"
                    />
                  ) : (
                    <div
                      className={`flex min-w-0 items-center gap-1.5 text-[12.5px] ${
                        isActive ? "font-medium text-primary" : "text-secondary"
                      }`}
                    >
                      {isActive && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          aria-label={t("chat.openConversation")}
                        />
                      )}
                      <span className="truncate">{c.name}</span>
                    </div>
                  )}
                  <div className="truncate text-[11px] text-tertiary">
                    {model ? `${model} · ${when}` : when}
                  </div>
                </div>
                <div className="hidden gap-0.5 group-focus-within:flex group-hover:flex">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(null);
                      renameCancelled.current = false;
                      setRenamingId(c.id);
                    }}
                    aria-label={`${t("chat.rename")} ${c.name}`}
                    title={t("chat.rename")}
                    className="rounded p-1 text-tertiary transition-colors hover:bg-surface hover:text-secondary"
                  >
                    <PencilSimple size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={c.id === streamingId}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(null);
                      setConfirmId(c.id);
                    }}
                    aria-label={`${t("chat.delete")} ${c.name}`}
                    title={
                      c.id === streamingId
                        ? t("chat.deleteWhileAnswering")
                        : t("chat.delete")
                    }
                    className="rounded p-1 text-tertiary transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
