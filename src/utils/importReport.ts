import i18next from "../i18n";
import type { ImportIssue } from "./sqlColumns";
import { summarizeIssues } from "./issueSummary";

function describeImportIssue(issue: ImportIssue): string {
  switch (issue.kind) {
    case "typeGuessed":
      return i18next.t("importIssues.typeGuessed", {
        table: issue.table,
        column: issue.column,
        type: issue.type,
      });
    case "checkSkipped":
      return i18next.t("importIssues.checkSkipped", { table: issue.table });
    case "indexSkipped":
      return i18next.t(
        issue.reason === "fulltext"
          ? "importIssues.fulltextSkipped"
          : issue.reason === "spatial"
            ? "importIssues.spatialSkipped"
            : "importIssues.expressionSkipped",
        { name: issue.name || i18next.t("importIssues.unnamed"), table: issue.table },
      );
    case "indexCondition":
      return i18next.t("importIssues.indexCondition", {
        name: issue.name || i18next.t("importIssues.unnamed"),
        table: issue.table,
      });
    case "generatedColumn":
      return i18next.t("importIssues.generatedColumn", {
        table: issue.table,
        column: issue.column,
      });
  }
}

export const describeImportIssues = (issues: readonly ImportIssue[]) =>
  summarizeIssues(issues, describeImportIssue);
