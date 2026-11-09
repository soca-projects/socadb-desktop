import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LANGUAGES, type Language } from "../i18n";
import { langStringNames, missingLangStrings } from "./nsisLanguage";

const NSIS_LANGUAGE: Record<Language, string> = { en: "English", fr: "French" };

const TAURI_DIR = fileURLToPath(new URL("../../src-tauri/", import.meta.url));

function nsisConfig() {
  return JSON.parse(readFileSync(TAURI_DIR + "tauri.conf.json", "utf-8")).bundle.windows
    .nsis;
}

function installerLanguages(): string[] {
  return nsisConfig().languages;
}

function frenchTexts(): string {
  return readFileSync(TAURI_DIR + nsisConfig().customLanguageFiles.French, "utf-8");
}

describe("Windows installer", () => {
  it("speaks every language of the app", () => {
    expect([...installerLanguages()].sort()).toEqual(
      SUPPORTED_LANGUAGES.map((language) => NSIS_LANGUAGE[language]).sort(),
    );
  });

  it("falls back to English, its first language, when Windows speaks another one", () => {
    expect(installerLanguages()[0]).toBe("English");
  });

  it("defines each of its French texts once, for French", () => {
    const lines = frenchTexts().trim().split(/\r?\n/);
    const names = langStringNames(frenchTexts());
    expect(names).toHaveLength(lines.length);
    expect(new Set(names).size).toBe(names.length);
    for (const line of lines) {
      expect(line).toMatch(/^LangString \w+ \$\{LANG_FRENCH\} ".+"$/);
    }
  });

  it("starts its French texts without a byte order mark, which Tauri adds itself", () => {
    expect(frenchTexts().charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("missingLangStrings", () => {
  const english =
    'LangString older ${LANG_ENGLISH} "older"\nLangString unknown ${LANG_ENGLISH} "unknown"\n';

  it("names the texts a translation lacks", () => {
    expect(
      missingLangStrings(english, 'LangString older ${LANG_FRENCH} "antérieure"'),
    ).toEqual(["unknown"]);
  });

  it("finds nothing missing in a complete translation", () => {
    expect(missingLangStrings(english, english)).toEqual([]);
  });
});
