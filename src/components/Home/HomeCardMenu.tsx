import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";

const MARGIN_PX = 8;

export interface HomeMenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface HomeCardMenuProps {
  x: number;
  y: number;
  label: string;
  items: HomeMenuItem[];
  onClose: () => void;
}

export function HomeCardMenu({ x, y, label, items, onClose }: HomeCardMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(MARGIN_PX, Math.min(x, window.innerWidth - width - MARGIN_PX))}px`;
    menu.style.top = `${Math.max(MARGIN_PX, Math.min(y, window.innerHeight - height - MARGIN_PX))}px`;
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const index = buttons.findIndex((b) => b === document.activeElement);
    const next =
      (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 w-56 rounded-[10px] border border-border bg-surface p-1 shadow-float"
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.separatorBefore && (
            <div role="separator" className="mx-1.5 my-1 h-px bg-border-light" />
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full flex-col gap-px rounded-md px-2.5 py-[7px] text-left text-[13px] outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted ${
              item.danger ? "text-red-600 dark:text-red-400" : "text-secondary"
            }`}
          >
            <span>{item.label}</span>
            {item.hint && <span className="text-[11px] text-tertiary">{item.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
