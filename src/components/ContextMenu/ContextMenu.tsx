import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  TrashIcon as Trash,
  PencilSimpleIcon as PencilSimple,
  CopyIcon as Copy,
} from "@phosphor-icons/react";
import { useClickOutside } from "../../hooks/useClickOutside";

const MARGIN_PX = 8;

interface ContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ContextMenu({
  x,
  y,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: ContextMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  // Opened at the pointer, the menu would run off the window near its edges.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(MARGIN_PX, Math.min(x, window.innerWidth - width - MARGIN_PX))}px`;
    menu.style.top = `${Math.max(MARGIN_PX, Math.min(y, window.innerHeight - height - MARGIN_PX))}px`;
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-float"
    >
      <button
        role="menuitem"
        onClick={onRename}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-secondary transition-colors hover:bg-surface-muted"
      >
        <PencilSimple size={14} />
        {t("contextMenu.rename")}
      </button>
      <button
        role="menuitem"
        onClick={onDuplicate}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-secondary transition-colors hover:bg-surface-muted"
      >
        <Copy size={14} />
        {t("contextMenu.duplicate")}
      </button>
      <div className="mx-2 my-1 h-px bg-border-light" />
      <button
        role="menuitem"
        onClick={onDelete}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
      >
        <Trash size={14} />
        {t("contextMenu.deleteTable")}
      </button>
    </div>
  );
}
