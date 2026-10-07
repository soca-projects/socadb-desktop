import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60";

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
  const idPrefix = useId();
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
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<(() => HTMLElement | null | undefined) | null>(null);

  useLayoutEffect(() => {
    const target = pendingFocus.current?.();
    pendingFocus.current = null;
    target?.focus();
  });

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

  const startRename = (id: string) => {
    setConfirmId(null);
    renameCancelled.current = false;
    setRenamingId(id);
  };

  const commitRename = (id: string, value: string) => {
    if (!renameCancelled.current) renameConversation(id, value);
    renameCancelled.current = false;
    setRenamingId(null);
  };

  const button = (kind: "open" | "delete", id: string) =>
    rootRef.current?.querySelector<HTMLButtonElement>(
      `[data-${kind}="${CSS.escape(id)}"]`,
    );

  const cancelDelete = (id: string) => {
    setConfirmId(null);
    pendingFocus.current = () => button("delete", id);
  };

  const confirmDelete = (id: string) => {
    const ordered = groups.flatMap((g) => g.items);
    const index = ordered.findIndex((c) => c.id === id);
    const neighbour = ordered[index + 1] ?? ordered[index - 1];
    deleteConversation(id);
    setConfirmId(null);
    pendingFocus.current = () => {
      const next = neighbour && button("open", neighbour.id);
      return next && !next.disabled ? next : searchRef.current;
    };
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-0.5 px-2 pb-3 pt-2.5">
      <div className="relative mx-1 mb-1.5">
        <MagnifyingGlass
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary"
        />
        <input
          ref={searchRef}
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

      {isStreaming && (
        <p role="status" className="mx-1 mb-1 text-[11.5px] leading-snug text-tertiary">
          {t("chat.lockedWhileAnswering")}
        </p>
      )}

      {groups.length === 0 && (
        <p className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-tertiary">
          {query.trim()
            ? t("chat.noMatch", { query: query.trim() })
            : t("chat.noConversations")}
        </p>
      )}

      {groups.map(({ group, items }) => {
        const headingId = `${idPrefix}-${group}`;
        return (
          <section key={group} aria-labelledby={headingId}>
            <h3
              id={headingId}
              className="px-2 pb-1 pt-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-tertiary"
            >
              {t(`chat.groups.${group}`)}
            </h3>
            <ul role="list" className="flex flex-col gap-0.5">
              {items.map((c) => {
                const isActive = c.id === activeId;
                const model = models.find((m) => m.id === c.model)?.displayName;
                const when = formatWhen(c.updatedAt, now, i18n.language, t);
                const meta = model ? `${model} · ${when}` : when;
                const confirmTextId = `${idPrefix}-confirm-${c.id}`;

                if (confirmId === c.id) {
                  return (
                    <li key={c.id}>
                      <div
                        role="group"
                        aria-labelledby={confirmTextId}
                        onKeyDown={(e) => {
                          if (e.key !== "Escape") return;
                          e.stopPropagation();
                          cancelDelete(c.id);
                        }}
                        className="grid gap-2 rounded-md border border-red-500/30 bg-red-500/[0.06] p-2 text-[12px] leading-snug text-secondary"
                      >
                        <p id={confirmTextId}>
                          {t("chat.deleteConfirm", { name: c.name })}
                        </p>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            autoFocus
                            onClick={() => cancelDelete(c.id)}
                            className={`rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium text-secondary transition-colors hover:bg-surface-muted ${FOCUS_RING}`}
                          >
                            {t("chat.cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDelete(c.id)}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white outline-none transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                          >
                            {t("chat.delete")}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                }

                if (renamingId === c.id) {
                  return (
                    <li
                      key={c.id}
                      className="grid gap-px rounded-md bg-surface-muted px-2 py-1.5"
                    >
                      <input
                        autoFocus
                        defaultValue={c.name}
                        aria-label={t("chat.renameLabel")}
                        onBlur={(e) => commitRename(c.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            pendingFocus.current = () => button("open", c.id);
                            commitRename(c.id, e.currentTarget.value);
                          }
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            renameCancelled.current = true;
                            pendingFocus.current = () => button("open", c.id);
                            setRenamingId(null);
                          }
                        }}
                        className="w-full rounded-[5px] border border-accent bg-surface px-1.5 py-0.5 text-[12.5px] text-primary outline-none"
                      />
                      <span className="truncate text-[11px] text-tertiary">{meta}</span>
                    </li>
                  );
                }

                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      data-open={c.id}
                      onClick={() => open(c)}
                      disabled={isStreaming && !isActive}
                      aria-current={isActive ? "true" : undefined}
                      className={`grid w-full min-w-0 gap-px rounded-md px-2 py-1.5 text-left transition-colors group-hover:bg-surface-muted focus-visible:bg-surface-muted disabled:cursor-default disabled:opacity-50 disabled:group-hover:bg-transparent ${FOCUS_RING}`}
                    >
                      <span
                        className={`flex min-w-0 items-center gap-1.5 text-[12.5px] ${
                          isActive ? "font-medium text-primary" : "text-secondary"
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          />
                        )}
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="truncate text-[11px] text-tertiary">{meta}</span>
                    </button>
                    <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 rounded-md bg-surface-muted pl-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => startRename(c.id)}
                        aria-label={`${t("chat.rename")} ${c.name}`}
                        title={t("chat.rename")}
                        className={`rounded p-1 text-tertiary transition-colors hover:bg-surface hover:text-secondary ${FOCUS_RING}`}
                      >
                        <PencilSimple size={13} />
                      </button>
                      <button
                        type="button"
                        data-delete={c.id}
                        disabled={c.id === streamingId}
                        onClick={() => {
                          setRenamingId(null);
                          setConfirmId(c.id);
                        }}
                        aria-label={`${t("chat.delete")} ${c.name}`}
                        title={t("chat.delete")}
                        className={`rounded p-1 text-tertiary transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tertiary ${FOCUS_RING}`}
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
