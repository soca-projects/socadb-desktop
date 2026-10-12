import { useState, type MouseEvent } from "react";
import { DotsThreeIcon as DotsThree } from "@phosphor-icons/react";
import type { DbType, Schema } from "../../types/schema";
import { useInView } from "../../hooks/useInView";
import { HomeCardMenu, type HomeMenuItem } from "./HomeCardMenu";
import { SchemaPreview } from "./SchemaPreview";

const MENU_WIDTH = 224;
const DOT_GRID = {
  backgroundImage: "radial-gradient(var(--color-fg-muted) 0.8px, transparent 0.8px)",
  backgroundSize: "10px 10px",
};

interface HomeCardProps {
  name: string;
  folder: string;
  meta: string;
  schema: Schema | null;
  dbType: DbType | null;
  badge: { label: string; tone: "accent" | "muted" } | null;
  openLabel: string;
  menuLabel: string;
  menuItems: HomeMenuItem[];
  onOpen: () => void;
}

export function HomeCard({
  name,
  folder,
  meta,
  schema,
  dbType,
  badge,
  openLabel,
  menuLabel,
  menuItems,
  onOpen,
}: HomeCardProps) {
  const [ref, inView] = useInView<HTMLButtonElement>();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = (e: MouseEvent) => {
    if (menuItems.length === 0) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const onMenuButton = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu((current) =>
      current ? null : { x: rect.right - MENU_WIDTH, y: rect.bottom + 6 },
    );
  };

  return (
    <div
      onContextMenu={onContextMenu}
      className="group relative min-w-0 rounded-lg border border-border bg-surface shadow-soft transition-shadow hover:shadow-float"
    >
      <button
        ref={ref}
        type="button"
        data-home-card
        onClick={onOpen}
        aria-label={openLabel}
        className="flex w-full min-w-0 flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span
          className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-[11px] border-b border-border-light bg-surface-canvas"
          style={DOT_GRID}
        >
          {inView && schema && <SchemaPreview schema={schema} />}
          <span className="absolute left-2 top-2 flex gap-1.5">
            {dbType && (
              <span className="rounded-[5px] border border-border bg-surface px-1.5 font-mono text-[10px] font-medium leading-4 text-tertiary">
                {dbType === "mysql" ? "MySQL" : "PostgreSQL"}
              </span>
            )}
            {badge && (
              <span
                className={`rounded-full border px-2 text-[11px] font-medium leading-4 ${
                  badge.tone === "accent"
                    ? "border-accent/20 bg-accent-light text-accent-hover"
                    : "border-border bg-surface text-tertiary"
                }`}
              >
                {badge.label}
              </span>
            )}
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-3 pb-3 pt-2.5">
          <span className="truncate text-[13.5px] font-medium text-primary">{name}</span>
          <span className="truncate text-[12px] text-tertiary">{folder}</span>
          <span className="mt-0.5 truncate text-[11.5px] text-tertiary">{meta}</span>
        </span>
      </button>
      {menuItems.length > 0 && (
        <button
          type="button"
          onMouseDown={(e) => {
            // Otherwise the menu's outside-click closes it and this click reopens it.
            if (menu) e.stopPropagation();
          }}
          onClick={onMenuButton}
          aria-label={menuLabel}
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          className="absolute right-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-md border border-border bg-surface text-secondary opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
        >
          <DotsThree size={16} />
        </button>
      )}
      {menu && (
        <HomeCardMenu
          x={menu.x}
          y={menu.y}
          label={menuLabel}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
