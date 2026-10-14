import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useThemeStore } from "../../stores/themeStore";
import {
  getColorVariants,
  normalizeTableColor,
  PRESET_COLORS,
} from "../../utils/tableColors";

interface ColorPaletteProps {
  color: string | undefined;
  onPick: (color: string) => void;
  onClose: () => void;
}

export function ColorPalette({ color, onPick, onClose }: ColorPaletteProps) {
  const { t } = useTranslation();
  const isDark = useThemeStore((s) => s.theme === "dark");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  const current = color && normalizeTableColor(color);

  useEffect(() => {
    const palette = ref.current;
    (
      palette?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      palette?.querySelector<HTMLElement>("button")
    )?.focus();
  }, []);

  return (
    <div
      ref={ref}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
      }}
      className="absolute left-[26px] top-9 z-20 grid grid-cols-5 gap-2 rounded-lg border border-border bg-surface p-2.5 shadow-float"
    >
      {PRESET_COLORS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => {
            onPick(preset);
            onClose();
          }}
          aria-label={t("sidePanel.color", { color: preset })}
          aria-pressed={preset === current}
          className={`h-[18px] w-[18px] rounded-full transition-transform hover:scale-110 ${
            preset === current
              ? "shadow-[0_0_0_2px_var(--color-surface),0_0_0_3.5px_var(--color-fg-tertiary)]"
              : ""
          }`}
          style={{ backgroundColor: getColorVariants(preset, isDark).dot }}
        />
      ))}
    </div>
  );
}
