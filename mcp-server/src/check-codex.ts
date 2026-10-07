import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODEX_DISABLED_FEATURES, locateCodex } from "./codex-exec.ts";

const { executable } = locateCodex();
const codexHome = mkdtempSync(join(tmpdir(), "socadb-codex-check-"));
try {
  const run = (args: string[]) =>
    execFileSync(executable, args, {
      env: { ...process.env, CODEX_HOME: codexHome },
      encoding: "utf8",
    });

  const known = new Set(
    run(["features", "list"])
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean),
  );
  const problems = CODEX_DISABLED_FEATURES.filter((feature) => !known.has(feature)).map(
    (feature) => `unknown feature "${feature}"`,
  );
  if (!run(["exec", "--help"]).includes("--ignore-user-config")) {
    problems.push("codex exec no longer has --ignore-user-config");
  }

  if (problems.length > 0) {
    console.error(
      `The bundled Codex CLI no longer accepts how the agent runner starts it:\n- ${problems.join("\n- ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Codex CLI OK: ${CODEX_DISABLED_FEATURES.length} features to disable, --ignore-user-config`,
    );
  }
} finally {
  rmSync(codexHome, { recursive: true, force: true });
}
