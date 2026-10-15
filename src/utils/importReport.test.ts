import { describe, it, expect } from "vitest";
import i18next from "../i18n";
import { describeImportIssues } from "./importReport";
import type { ImportIssue } from "./sqlColumns";

const ALL: ImportIssue[] = [
  { kind: "typeGuessed", table: "people", column: "tags", type: "text[]" },
  { kind: "checkSkipped", table: "people" },
  { kind: "indexSkipped", table: "people", name: "people_bio_ft", reason: "fulltext" },
  { kind: "indexSkipped", table: "people", name: "people_geo", reason: "spatial" },
  { kind: "indexSkipped", table: "people", name: "", reason: "expression" },
  { kind: "indexCondition", table: "people", name: "people_active" },
  { kind: "generatedColumn", table: "people", column: "full_name" },
];

describe("describeImportIssues", () => {
  it.each(["en", "fr"])("writes a sentence for every issue in %s", async (lng) => {
    await i18next.changeLanguage(lng);
    for (const issue of ALL) {
      const text = describeImportIssues([issue]);
      expect(text).not.toMatch(/importIssues\.|\{\{/);
      expect(text).toContain("people");
    }
  });

  it("lists the first three and counts the rest", async () => {
    await i18next.changeLanguage("en");
    const text = describeImportIssues(ALL);
    expect(text).toContain("tags");
    expect(text).toContain("people_bio_ft");
    expect(text).not.toContain("people_geo");
    expect(text.endsWith("And 4 more.")).toBe(true);
  });
});
