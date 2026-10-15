import i18next from "../i18n";

const SHOWN = 3;

export function summarizeIssues<T>(
  issues: readonly T[],
  describe: (issue: T) => string,
): string {
  const lines = issues.slice(0, SHOWN).map(describe);
  if (issues.length > SHOWN) {
    lines.push(i18next.t("issues.more", { count: issues.length - SHOWN }));
  }
  return lines.join(" ");
}
