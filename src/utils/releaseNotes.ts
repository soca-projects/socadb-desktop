import enChangelog from "../../CHANGELOG.md?raw";
import frChangelog from "../../CHANGELOG.fr.md?raw";
import type { Language } from "../i18n";

export interface Inline {
  text: string;
  bold?: boolean;
  code?: boolean;
}

export interface ReleaseSection {
  title: string;
  items: Inline[][];
}

export interface Release {
  version: string;
  date: string;
  intro: Inline[][];
  sections: ReleaseSection[];
}

// Written for developers: kept in the changelog, never shown in the app.
const DEVELOPER_SECTIONS = new Set(["Internal", "Interne"]);
const LINKS = /\[([^\]]+)\]\([^)]+\)/g;
const PR_REFS = /\s*\((?:#\d+(?:,\s*)?)+\)/g;
const COMMIT_REFS = /\s*\([0-9a-f]{7,40}\)/g;
const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(text: string): Inline[] {
  const clean = text.replace(LINKS, "$1").replace(PR_REFS, "").replace(COMMIT_REFS, "");
  const parts: Inline[] = [];
  let last = 0;
  for (const match of clean.matchAll(INLINE)) {
    if (match.index > last) parts.push({ text: clean.slice(last, match.index) });
    if (match[1] !== undefined) {
      parts.push({ text: match[1].replaceAll("`", ""), bold: true });
    } else {
      parts.push({ text: match[2] ?? "", code: true });
    }
    last = match.index + match[0].length;
  }
  if (last < clean.length) parts.push({ text: clean.slice(last) });
  return parts;
}

function parseRelease(chunk: string): Release | null {
  const header = /^\[([^\]]+)\](?:\s*-\s*(\S+))?/.exec(chunk);
  const version = header?.[1];
  if (!version || version.toLowerCase() === "unreleased") return null;
  const release: Release = { version, date: header[2] ?? "", intro: [], sections: [] };
  let section: ReleaseSection | null = null;
  let block: string[] = [];
  const flush = () => {
    if (block.length === 0) return;
    const inline = parseInline(block.join(" "));
    if (section) section.items.push(inline);
    else release.intro.push(inline);
    block = [];
  };
  for (const raw of chunk.split("\n").slice(1)) {
    const line = raw.trim();
    if (/^\[[^\]]+\]:\s/.test(line)) continue;
    if (line === "") {
      flush();
    } else if (line.startsWith("### ")) {
      flush();
      section = { title: line.slice(4).trim(), items: [] };
      release.sections.push(section);
    } else if (/^[-*] /.test(line)) {
      flush();
      block = [line.slice(2)];
    } else {
      block.push(line);
    }
  }
  flush();
  release.sections = release.sections.filter(
    (s) => s.items.length > 0 && !DEVELOPER_SECTIONS.has(s.title),
  );
  return release.intro.length > 0 || release.sections.length > 0 ? release : null;
}

export function parseChangelog(markdown: string): Release[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .flatMap((chunk) => parseRelease(chunk) ?? []);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function releasesBetween(
  releases: Release[],
  after: string,
  upTo: string,
): Release[] {
  return releases.filter(
    (r) => compareVersions(r.version, after) > 0 && compareVersions(r.version, upTo) <= 0,
  );
}

export type SectionKind = "added" | "changed" | "fixed" | "other";

const SECTION_KINDS: Record<string, SectionKind> = {
  Added: "added",
  Ajouts: "added",
  Changed: "changed",
  Changements: "changed",
  Fixed: "fixed",
  Corrections: "fixed",
};

export function sectionKind(title: string): SectionKind {
  return SECTION_KINDS[title] ?? "other";
}

export function releasesAfter(releases: Release[], since: string | null): Release[] {
  if (since === null) return releases;
  return releases.filter((r) => compareVersions(r.version, since) > 0);
}

export function formatReleaseDate(date: string, language: Language): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(
    new Date(year, month - 1, day),
  );
}

const parsed: Partial<Record<Language, Release[]>> = {};

export function releasesFor(language: Language): Release[] {
  return (parsed[language] ??= parseChangelog(
    language === "fr" ? frChangelog : enChangelog,
  ));
}
