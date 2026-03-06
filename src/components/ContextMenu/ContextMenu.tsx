import { useEffect, useRef } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, onDelete, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: x, top: y }}
      className="z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
    >
      <button
        onClick={onDelete}
        className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
      >
        Delete Table
      </button>
    </div>
  );
}
