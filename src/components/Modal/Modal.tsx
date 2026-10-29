import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  maxWidth?: string;
  zIndex?: number;
  ariaLabelledBy?: string;
}

export function Modal({
  children,
  onClose,
  dismissible = true,
  maxWidth = "max-w-[400px]",
  zIndex = 50,
  ariaLabelledBy,
}: ModalProps) {
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) onCloseRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // With the focus left behind on the page, the canvas's Delete/Backspace
  // shortcut would remove the selected relation under the dialog (nokey).
  useEffect(() => {
    const overlay = overlayRef.current;
    if (overlay && !overlay.contains(document.activeElement)) overlay.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="nokey fixed inset-0 flex items-center justify-center bg-black/30 p-4 outline-none backdrop-blur-[2px]"
      style={{ zIndex }}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-labelledby={ariaLabelledBy}
        className={`w-full ${maxWidth} animate-fade-in rounded-xl border border-border bg-surface shadow-float`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
