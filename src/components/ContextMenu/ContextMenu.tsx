import { useRef } from "react";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useClickOutside } from "../../hooks/useClickOutside";

interface ContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, onDelete, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-white py-1 shadow-float"
    >
      <button
        onClick={onDelete}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50"
      >
        <Trash size={14} />
        Delete Table
      </button>
    </div>
  );
}
