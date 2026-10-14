import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckIcon as Check,
  MagnifyingGlassIcon as MagnifyingGlass,
} from "@phosphor-icons/react";

export interface PickItem {
  value: string;
  label: string;
  hint?: string;
  muted?: boolean;
}

export interface PickGroup {
  label?: string;
  items: PickItem[];
}

interface PickMenuProps {
  anchor: HTMLElement;
  value: string;
  getGroups: (query: string) => PickGroup[];
  searchPlaceholder?: string;
  // Set when the anchor is a text field the menu completes: the field keeps
  // the focus, its text filters the list and its arrow keys drive it.
  query?: string;
  emptyLabel?: (query: string) => string;
  width?: number;
  onPick: (value: string) => void;
  onClose: () => void;
}

const GAP_PX = 4;
const MARGIN_PX = 8;
const MAX_HEIGHT_PX = 380;
const FLIP_BELOW_PX = 240;

// Portalled and fixed so the side panel's scroll area cannot clip it.
export function PickMenu({
  anchor,
  value,
  getGroups,
  searchPlaceholder,
  query: fieldQuery,
  emptyLabel,
  width = 244,
  onPick,
  onClose,
}: PickMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = fieldQuery !== undefined;
  const [ownQuery, setOwnQuery] = useState("");
  const query = fieldQuery ?? ownQuery;
  const groups = useMemo(() => getGroups(query), [getGroups, query]);
  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [active, setActive] = useState(() =>
    typeahead
      ? -1
      : Math.max(
          0,
          items.findIndex((i) => i.value === value),
        ),
  );
  // In a text field, Enter on an empty field must still reach the field.
  const [activeFor, setActiveFor] = useState(query);
  if (activeFor !== query) {
    setActiveFor(query);
    setActive(typeahead && !query.trim() ? -1 : 0);
  }
  const hidden = typeahead && !items.length;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const r = anchor.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - MARGIN_PX;
    const above = r.top - MARGIN_PX;
    const up = below < FLIP_BELOW_PX && above > below;
    const room = Math.min(MAX_HEIGHT_PX, up ? above : below);
    const w = Math.max(width, r.width);
    menu.style.width = `${w}px`;
    menu.style.maxHeight = `${room}px`;
    menu.style.left = `${Math.max(MARGIN_PX, Math.min(r.left, window.innerWidth - w - MARGIN_PX))}px`;
    if (up) menu.style.bottom = `${window.innerHeight - r.top + GAP_PX}px`;
    else menu.style.top = `${r.bottom + GAP_PX}px`;
  }, [anchor, width, hidden]);

  useEffect(() => {
    if (typeahead) return;
    if (searchPlaceholder) searchRef.current?.focus();
    else menuRef.current?.focus();
  }, [typeahead, searchPlaceholder]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    // The anchor moves when the panel scrolls; closing beats a drifting menu.
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  const pick = (item: PickItem) => {
    onPick(item.value);
    onClose();
    anchor.focus();
  };

  const handleKey = (e: {
    key: string;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => {
    // Otherwise Escape would close an invisible list instead of the editor.
    if (hidden) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return true;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(
        (a) => (Math.max(a, step === 1 ? -1 : 0) + step + items.length) % items.length,
      );
      return true;
    }
    if (e.key === "Enter") {
      const item = items[active];
      if (!item) return false;
      e.preventDefault();
      pick(item);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      anchor.focus();
      return true;
    }
    if (e.key === "Tab") {
      if (!typeahead) {
        e.preventDefault();
        anchor.focus();
      }
      onClose();
      return true;
    }
    return false;
  };
  const handleKeyRef = useRef(handleKey);
  useEffect(() => {
    handleKeyRef.current = handleKey;
  });

  // The field's own keydown runs after this one and must not see the keys the
  // menu used: Enter would also commit and blur, Escape close the editor.
  useEffect(() => {
    if (!typeahead) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (handleKeyRef.current(e) && e.key !== "Tab") e.stopPropagation();
    };
    anchor.addEventListener("keydown", onKey);
    return () => anchor.removeEventListener("keydown", onKey);
  }, [typeahead, anchor]);

  if (hidden) return null;

  let index = 0;
  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      tabIndex={-1}
      onKeyDown={(e: KeyboardEvent) => handleKey(e)}
      onMouseDown={typeahead ? (e) => e.preventDefault() : undefined}
      style={{ position: "fixed" }}
      className="z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-float outline-none"
    >
      {searchPlaceholder && !typeahead && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-light px-2.5 text-tertiary">
          <MagnifyingGlass size={13} />
          <input
            ref={searchRef}
            value={ownQuery}
            onChange={(e) => setOwnQuery(e.target.value)}
            placeholder={searchPlaceholder}
            spellCheck={false}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-primary outline-none placeholder:text-tertiary"
          />
        </div>
      )}
      <div ref={listRef} className="overflow-y-auto p-1">
        {groups.map((group, g) => (
          <div key={group.label ?? g}>
            {group.label && (
              <div className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-tertiary">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const i = index++;
              const selected = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => pick(item)}
                  className={`flex h-7 w-full items-center gap-1.5 rounded-md pl-1 pr-2 text-left outline-none ${
                    i === active ? "bg-surface-muted" : ""
                  }`}
                >
                  <span className="flex w-3.5 shrink-0 justify-center text-accent">
                    {selected && <Check size={12} weight="bold" />}
                  </span>
                  <span
                    className={
                      item.muted
                        ? "text-[12.5px] text-tertiary"
                        : "whitespace-nowrap font-mono text-[12px] text-primary"
                    }
                  >
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="min-w-0 flex-1 truncate text-right text-[11px] text-tertiary">
                      {item.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {!items.length && emptyLabel && (
          <p className="px-2.5 pb-1 pt-2 text-[12px] text-tertiary">
            {emptyLabel(query)}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
