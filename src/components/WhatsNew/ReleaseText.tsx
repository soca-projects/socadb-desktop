import type { Inline } from "../../utils/releaseNotes";

export function ReleaseText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-primary">
            {part.text}
          </strong>
        ) : part.code ? (
          <code key={i} className="rounded bg-surface-muted px-1 font-mono text-[11.5px]">
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
