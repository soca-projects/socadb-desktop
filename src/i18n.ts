import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
type Language = (typeof SUPPORTED_LANGUAGES)[number];

function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as Language);
}

function getInitialLanguage(): Language {
  const stored = localStorage.getItem("socadb_language");
  if (isLanguage(stored)) return stored;
  const systemLang = navigator.language.split("-")[0];
  if (isLanguage(systemLang)) return systemLang;
  return "en";
}

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  supportedLngs: ["en", "fr"],
  interpolation: { escapeValue: false },
});

export default i18next;
export { SUPPORTED_LANGUAGES, isLanguage };
export type { Language };
