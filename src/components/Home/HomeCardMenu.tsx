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
    ref.current?.focus();
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
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next =
      index === -1
        ? step === 1
          ? 0
          : buttons.length - 1
        : (index + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 w-56 rounded-[10px] border border-border bg-surface p-1 shadow-float outline-none"
    >
      {items.map((item) => (
        <div key={item.label}>
          {item.separatorBefore && (
            <div role="separator" className="mx-1.5 my-1 h-px bg-border-light" />
          )}
          {/* The pointer moves the focus, so one item is highlighted at a time;
              the background is the highlight, without the global focus ring. */}
          <button
            type="button"
            role="menuitem"
            onMouseMove={(e) => {
              if (document.activeElement !== e.currentTarget) e.currentTarget.focus();
            }}
            onMouseLeave={() => ref.current?.focus()}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full flex-col gap-px rounded-md px-2.5 py-[7px] text-left text-[13px] outline-none focus:!shadow-none ${
              item.danger
                ? "text-red-600 focus:bg-red-500/10 dark:text-red-400"
                : "text-secondary focus:bg-surface-muted"
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
