import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SUPPORTED_LANGUAGES, type Language } from "../i18n";

const NSIS_LANGUAGE: Record<Language, string> = { en: "English", fr: "French" };

function installerLanguages(): string[] {
  const file = fileURLToPath(new URL("../../src-tauri/tauri.conf.json", import.meta.url));
  return JSON.parse(readFileSync(file, "utf-8")).bundle.windows.nsis.languages;
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
});
