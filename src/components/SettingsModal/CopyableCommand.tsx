import { useCallback, useState } from "react";
import { CopyIcon as Copy, CheckIcon as Check } from "@phosphor-icons/react";

export function CopyableCommand({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <button
      onClick={copy}
      className="flex w-full items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-left font-mono text-[11px] text-tertiary transition-colors hover:bg-surface-muted dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600/70"
    >
      <span className="min-w-0 break-all">{children}</span>
      {copied ? (
        <Check size={12} className="shrink-0 text-emerald-500" />
      ) : (
        <Copy size={12} className="shrink-0" />
      )}
    </button>
  );
}
