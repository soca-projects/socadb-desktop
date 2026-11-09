export function langStringNames(file: string): string[] {
  return [...file.matchAll(/^\s*LangString\s+(\w+)\s/gm)].map((match) => match[1]);
}

export function missingLangStrings(reference: string, translation: string): string[] {
  const translated = new Set(langStringNames(translation));
  return langStringNames(reference).filter((name) => !translated.has(name));
}
