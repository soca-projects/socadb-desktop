import { useRef } from "react";
import {
  TrashIcon as Trash,
  PencilSimpleIcon as PencilSimple,
  CopyIcon as Copy,
} from "@phosphor-icons/react";
import { useClickOutside } from "../../hooks/useClickOutside";

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
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-float"
    >
      <button
        onClick={onRename}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-700 transition-colors hover:bg-surface-muted"
      >
        <PencilSimple size={14} />
        Rename
      </button>
      <button
        onClick={onDuplicate}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-stone-700 transition-colors hover:bg-surface-muted"
      >
        <Copy size={14} />
        Duplicate
      </button>
      <div className="mx-2 my-1 h-px bg-border-light" />
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
