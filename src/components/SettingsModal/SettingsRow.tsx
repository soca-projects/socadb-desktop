import { useId, useRef, useState, type ReactNode } from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { arrowTarget } from "../../utils/arrowKeys";

export const SETTINGS_SELECT =
  "rounded-md border border-border bg-surface py-1.5 pl-3 pr-2 text-[12px] font-medium text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent";

export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-primary">{label}</div>
        {description && (
          <div className="mt-0.5 text-[12px] leading-snug text-tertiary">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function DisclosureRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      {/* Inset so the group's overflow-hidden doesn't clip the focus ring. */}
      <div className="p-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium text-secondary transition-colors hover:bg-surface-muted/50 hover:text-primary focus-visible:rounded-md"
        >
          {label}
          <CaretDown
            size={12}
            className={`shrink-0 text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {open && (
        <div id={panelId} className="space-y-3 px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = options.findIndex((o) => o.value === value);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        const next = arrowTarget(e.key, index, options.length, "both");
        const option = next === null ? undefined : options[next];
        if (next === null || !option) return;
        e.preventDefault();
        onChange(option.value);
        buttons.current[next]?.focus();
      }}
      className="flex gap-0.5 rounded border border-border bg-surface-muted p-0.5"
    >
      {options.map((option, i) => {
        const active = i === index;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
              active
                ? "bg-surface text-primary shadow-soft dark:bg-border-hover"
                : "text-tertiary hover:text-secondary"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
