import { describe, it, expect } from "vitest";
import en from "../../CHANGELOG.md?raw";
import fr from "../../CHANGELOG.fr.md?raw";
import {
  compareVersions,
  formatReleaseDate,
  parseChangelog,
  parseInline,
  releasesAfter,
  releasesBetween,
  sectionKind,
  type Inline,
} from "./releaseNotes";

const text = (parts: Inline[]) => parts.map((p) => p.text).join("");

describe("release notes parser", () => {
  const releases = parseChangelog(en);

  it("reads every released version, newest first, with its date", () => {
    expect(releases.map((r) => r.version)).toEqual([
      "0.1.5",
      "0.1.4",
      "0.1.3",
      "0.1.2",
      "0.1.1",
      "0.1.0",
    ]);
    expect(releases[0]?.date).toBe("2026-10-20");
  });

  it("keeps the intro, joins wrapped lines and drops developer sections", () => {
    const latest = releases[0];
    expect(text(latest?.intro[0] ?? [])).toMatch(
      /^Schemas now carry what a real database needs: notes on tables and columns,/,
    );
    expect(latest?.sections.map((s) => s.title)).toEqual(["Added", "Changed", "Fixed"]);
    expect(releases.flatMap((r) => r.sections.map((s) => s.title))).not.toContain(
      "Internal",
    );
  });

  it("keeps a wrapped list item whole", () => {
    const added = releases[0]?.sections[0]?.items ?? [];
    expect(added).toHaveLength(9);
    expect(text(added[0] ?? [])).toBe(
      "Notes, enums, indexes and type parameters. Tables and columns take notes, columns take enums, lengths, precision and scale, MySQL numeric columns take UNSIGNED, and tables take indexes. Older files open unchanged.",
    );
  });

  it("removes PR references and the link list", () => {
    const all = releases
      .flatMap((r) => [...r.intro, ...r.sections.flatMap((s) => s.items)])
      .map(text)
      .join("\n");
    expect(all).not.toMatch(/#\d+/);
    expect(all).not.toContain("https://");
  });

  it("parses bold, code and links inline", () => {
    expect(
      parseInline("**DBML import**. Uses `ON DELETE` and [docs](https://x.y). (#104)"),
    ).toEqual([
      { text: "DBML import", bold: true },
      { text: ". Uses " },
      { text: "ON DELETE", code: true },
      { text: " and docs." },
    ]);
    expect(parseInline("**`.soca` file format**")).toEqual([
      { text: ".soca file format", bold: true },
    ]);
    expect(parseInline("Two PRs (#106, #107) here")).toEqual([{ text: "Two PRs here" }]);
  });

  it("strips release-please references and links inside bold", () => {
    expect(
      parseInline(
        "**[DBML](https://dbml.dbdiagram.io) import** ([#155](https://github.com/o/r/issues/155)) ([4bd6998](https://github.com/o/r/commit/4bd6998))",
      ),
    ).toEqual([{ text: "DBML import", bold: true }]);
  });

  it("keeps only releases and sections with something to show", () => {
    const parsed = parseChangelog(
      [
        "## [0.1.7] - 2026-11-20",
        "",
        "### Internal",
        "",
        "- Dependencies are updated.",
        "",
        "## [0.1.6] - 2026-11-10",
        "",
        "### Added",
        "### Fixed",
        "",
        "* **Starred bullet**. Works too.",
      ].join("\n"),
    );
    expect(parsed.map((r) => r.version)).toEqual(["0.1.6"]);
    expect(parsed[0]?.sections.map((s) => s.title)).toEqual(["Fixed"]);
    expect(text(parsed[0]?.sections[0]?.items[0] ?? [])).toBe(
      "Starred bullet. Works too.",
    );
  });

  it("orders versions numerically and keeps the ones in range", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.5", "0.1.5")).toBe(0);
    expect(releasesBetween(releases, "0.1.3", "0.1.5").map((r) => r.version)).toEqual([
      "0.1.5",
      "0.1.4",
    ]);
    expect(releasesBetween(releases, "0.1.5", "0.1.5")).toEqual([]);
  });

  it("lists everything after a version, or the whole history", () => {
    expect(releasesAfter(releases, "0.1.3").map((r) => r.version)).toEqual([
      "0.1.5",
      "0.1.4",
    ]);
    expect(releasesAfter(releases, null)).toHaveLength(6);
  });

  it("writes the date in the app's language without a timezone shift", () => {
    expect(formatReleaseDate("2026-10-20", "fr")).toBe("20 octobre 2026");
    expect(formatReleaseDate("2026-10-20", "en")).toBe("October 20, 2026");
    expect(formatReleaseDate("", "en")).toBe("");
  });
});

describe("French release notes", () => {
  const english = parseChangelog(en);
  const french = parseChangelog(fr);

  it("cover every English version with the same dates and structure", () => {
    expect(french.map((r) => [r.version, r.date])).toEqual(
      english.map((r) => [r.version, r.date]),
    );
    french.forEach((release, i) => {
      const source = english[i];
      expect(release.intro.length, release.version).toBe(source?.intro.length);
      expect(
        release.sections.map((s) => s.items.length),
        release.version,
      ).toEqual(source?.sections.map((s) => s.items.length));
    });
  });
});

describe("section kinds", () => {
  it("recognises the sections in both languages", () => {
    expect(["Added", "Ajouts"].map(sectionKind)).toEqual(["added", "added"]);
    expect(["Changed", "Changements"].map(sectionKind)).toEqual(["changed", "changed"]);
    expect(["Fixed", "Corrections"].map(sectionKind)).toEqual(["fixed", "fixed"]);
    expect(sectionKind("Security")).toBe("other");
  });
});
