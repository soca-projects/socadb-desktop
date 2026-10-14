import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

interface NoteBubbleProps {
  name: string;
  note: string;
  placeholder: string;
  // The button that opens the bubble; Escape gives it the focus back.
  anchor: HTMLElement;
  // Positioned under `below` (the anchor by default), across `frame`.
  below?: HTMLElement;
  frame: HTMLElement;
  onCommit: (note: string) => void;
  onClose: () => void;
}

// The note is edited here only, never shown inline: the panel stays compact
// and the canvas shows a note icon whose hover reads it. One edit is one undo
// step, so the text is committed on blur and on close, not per keystroke.
export function NoteBubble({
  name,
  note,
  placeholder,
  anchor,
  below = anchor,
  frame,
  onCommit,
  onClose,
}: NoteBubbleProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(note);
  const draftRef = useRef(note);
  // Blur and the outside mousedown both commit; the second must not add a
  // duplicate undo step.
  const savedRef = useRef(note);

  const commit = () => {
    const next = draftRef.current.trim() ? draftRef.current : "";
    if (next === savedRef.current) return;
    savedRef.current = next;
    onCommit(next);
  };
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  useLayoutEffect(() => {
    const bubble = ref.current;
    if (!bubble) return;
    const a = below.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const host = bubble.offsetParent?.getBoundingClientRect() ?? f;
    bubble.style.top = `${a.bottom - host.top + 6}px`;
    bubble.style.left = `${f.left - host.left + 8}px`;
    bubble.style.width = `${f.width - 16}px`;
  }, [below, frame]);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    text.focus();
    text.setSelectionRange(text.value.length, text.value.length);
  }, []);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    text.style.height = "auto";
    text.style.height = `${Math.max(52, text.scrollHeight + 2)}px`;
  }, [draft]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      commitRef.current();
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        commit();
        onClose();
        anchor.focus();
      }}
      className="absolute z-30 rounded-lg border border-border bg-surface p-2.5 shadow-float"
    >
      <div className="mb-1.5 text-[11.5px] text-tertiary">
        <Trans
          i18nKey="sidePanel.noteTitle"
          values={{ name }}
          components={{ name: <span className="font-mono font-medium text-secondary" /> }}
        />
      </div>
      <textarea
        ref={textRef}
        value={draft}
        rows={2}
        onChange={(e) => {
          setDraft(e.target.value);
          draftRef.current = e.target.value;
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="w-full resize-none overflow-hidden rounded-[4px] border border-border bg-surface px-[7px] py-1 text-[12.5px] leading-[1.4] text-secondary outline-none placeholder:text-tertiary hover:border-border-hover focus:border-accent/45"
      />
      <div className="mt-1.5 text-[11px] text-muted">{t("sidePanel.noteExported")}</div>
    </div>
  );
}
