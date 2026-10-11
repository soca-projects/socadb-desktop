#!/usr/bin/env bun
import { spawnSync } from "node:child_process";

const USAGE = `Usage: bun run release:rc [X.Y.Z] [--dry-run]
  Tags origin/develop with the next release candidate and pushes the tag,
  which starts the release build. The version defaults to the last stable
  release's next patch. --dry-run prints the tag without creating it.`;

type Version = [number, number, number];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf-8" });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  return result.stdout.trim();
}

function parse(text: string): Version | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
const dryRun = args.includes("--dry-run");
const requested = args.find((arg) => !arg.startsWith("--"));

git("fetch", "--quiet", "origin", "develop");

// Tag name → commit, from the remote so a tag that only exists locally is ignored.
// Annotated tags also list a peeled "^{}" line that points at the commit.
const tags = new Map<string, string>();
for (const line of git("ls-remote", "--tags", "origin", "v*").split("\n")) {
  const [sha, ref] = line.split("\t");
  if (!sha || !ref) continue;
  const name = ref.replace("refs/tags/", "");
  if (name.endsWith("^{}")) tags.set(name.slice(0, -3), sha);
  else if (!tags.has(name)) tags.set(name, sha);
}

const stable = [...tags.keys()]
  .map((name) => parse(name.slice(1)))
  .filter((version) => version !== undefined)
  .sort(compare)
  .at(-1);
if (!stable) fail("No stable vX.Y.Z tag on origin.");

const next: Version = [stable[0], stable[1], stable[2] + 1];
const base = requested ? parse(requested) : next;
if (!base) fail(`${requested} is not X.Y.Z.\n\n${USAGE}`);
if (compare(base, stable) <= 0)
  fail(`${base.join(".")} is not after the last stable release, v${stable.join(".")}.`);

const prefix = `v${base.join(".")}-rc.`;
const candidates = [...tags.keys()]
  .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
  .map((name) => Number(name.slice(prefix.length)));
const tag = `${prefix}${Math.max(0, ...candidates) + 1}`;

const commit = git("rev-parse", "origin/develop");
const subject = git("log", "-1", "--format=%s", commit);
const alreadyTagged = [...tags].find(([, sha]) => sha === commit)?.[0];
if (alreadyTagged)
  fail(`origin/develop (${commit.slice(0, 7)}) is already ${alreadyTagged}.`);

console.log(`Last stable  v${stable.join(".")}`);
console.log(`Next RC      ${tag}`);
console.log(`Commit       ${commit.slice(0, 7)} ${subject} (origin/develop)`);
if (compare(base, next) !== 0)
  console.log(
    `\nrelease-please proposes the next patch for the stable release. To publish ${base.join(".")}, add "Release-As: ${base.join(".")}" to a commit message on develop before merging into main.`,
  );

if (dryRun) {
  console.log("\nDry run: nothing tagged.");
  process.exit(0);
}

git("tag", tag, commit);
const push = spawnSync("git", ["push", "origin", `refs/tags/${tag}`], {
  stdio: "inherit",
});
if (push.status !== 0) {
  git("tag", "-d", tag);
  fail(`Pushing ${tag} failed; the local tag was removed.`);
}
console.log(
  `\nPushed ${tag}. Build: https://github.com/soca-projects/socadb-desktop/actions/workflows/release.yml`,
);
