import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";
import { getEffortLevelsForModel, type EffortLevel } from "../../types/chat";
import { useClickOutside } from "../../hooks/useClickOutside";

interface EffortPickerProps {
  modelId: string;
  value: EffortLevel;
  onChange: (effort: EffortLevel) => void;
  disabled?: boolean;
}

export function EffortPicker({ modelId, value, onChange, disabled }: EffortPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);

  const levels = getEffortLevelsForModel(modelId);
  if (levels.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("effort.label")}
        className="flex items-center gap-0.5 rounded-md border border-border bg-surface-muted py-1 pl-2 pr-1.5 text-[12px] font-medium text-secondary outline-none transition-colors hover:border-border-hover focus:border-accent disabled:opacity-50"
      >
        <span>{t(`effort.${value}`)}</span>
        <CaretDown size={10} className="text-tertiary" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-30 mt-1 min-w-[120px] overflow-hidden rounded-md border border-border bg-surface py-1 shadow-card"
        >
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              role="option"
              aria-selected={level === value}
              onClick={() => {
                onChange(level);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] text-secondary outline-none transition-colors hover:bg-surface-muted"
            >
              <span>{t(`effort.${level}`)}</span>
              {level === value && (
                <Check size={11} className="text-accent" weight="bold" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
