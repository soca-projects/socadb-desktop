import { useTranslation } from "react-i18next";
import {
  DownloadSimpleIcon as DownloadSimple,
  ProhibitIcon as Prohibit,
} from "@phosphor-icons/react";

export function DropOverlay({ kind }: { kind: "accept" | "reject" }) {
  const { t } = useTranslation();
  const accept = kind === "accept";
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-4 bottom-4 top-14 z-40 flex flex-col items-center justify-center gap-3.5 rounded-xl border-2 border-dashed p-8 text-center ${
        accept ? "border-accent bg-accent-light" : "border-border-hover bg-surface-muted"
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface">
        {accept ? (
          <DownloadSimple size={26} className="text-accent" aria-hidden />
        ) : (
          <Prohibit size={26} className="text-tertiary" aria-hidden />
        )}
      </div>
      <p className="text-[18px] font-bold text-primary">
        {t(accept ? "drop.accept" : "drop.reject")}
      </p>
      <p className="max-w-[460px] text-[14px] leading-normal text-tertiary">
        {t(accept ? "drop.acceptHint" : "drop.rejectHint")}
      </p>
    </div>
  );
}
