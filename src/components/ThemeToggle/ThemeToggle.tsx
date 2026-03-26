import { useTranslation } from "react-i18next";
import { SunIcon as Sun, MoonIcon as Moon } from "@phosphor-icons/react";
import { useThemeStore } from "../../stores/themeStore";

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className="relative rounded-md p-1.5 text-tertiary transition-colors hover:bg-surface-muted hover:text-secondary"
      title={theme === "light" ? t("theme.switchToDark") : t("theme.switchToLight")}
      aria-label={theme === "light" ? t("theme.switchToDark") : t("theme.switchToLight")}
    >
      <Sun
        size={16}
        className={`absolute inset-0 m-auto transition-[opacity,transform] duration-200 ${
          theme === "dark"
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0"
        }`}
      />
      <Moon
        size={16}
        className={`transition-[opacity,transform] duration-200 ${
          theme === "light"
            ? "rotate-0 scale-100 opacity-100"
            : "rotate-90 scale-0 opacity-0"
        }`}
      />
    </button>
  );
}
