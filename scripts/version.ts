#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USAGE = `Usage: bun scripts/version.ts <check|set> <X.Y.Z>
  check   fail unless every version file holds X.Y.Z
  set     write X.Y.Z into every version file`;

const ROOT = join(import.meta.dir, "..");

// Windows checkouts convert line endings, hence \r?\n.
const FILES = [
  { path: "package.json", pattern: /^( {2}"version": ")([^"]*)(")/m },
  { path: "mcp-server/package.json", pattern: /^( {2}"version": ")([^"]*)(")/m },
  { path: "src-tauri/tauri.conf.json", pattern: /^( {2}"version": ")([^"]*)(")/m },
  { path: "src-tauri/Cargo.toml", pattern: /^(version = ")([^"]*)(")/m },
  {
    path: "src-tauri/Cargo.lock",
    pattern: /^(name = "socadb-desktop"\r?\nversion = ")([^"]*)(")/m,
  },
];

function report(message: string, file?: string) {
  if (process.env.GITHUB_ACTIONS)
    console.log(`::error${file ? ` file=${file}` : ""}::${message}`);
  else console.error(file ? `${file}: ${message}` : message);
}

function fail(message: string, file?: string): never {
  report(message, file);
  process.exit(1);
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf-8");
}

function check(version: string) {
  let mismatch = false;
  for (const { path, pattern } of FILES) {
    const actual = pattern.exec(read(path))?.[2];
    if (actual === version) continue;
    mismatch = true;
    report(
      `${actual === undefined ? "no version found" : `version is ${actual}`}, expected ${version}`,
      path,
    );
  }
  if (mismatch) process.exit(1);
  console.log(`All ${FILES.length} version files hold ${version}.`);
}

function set(version: string) {
  const updates = FILES.map(({ path, pattern }) => {
    const text = read(path);
    if (!pattern.test(text)) fail("no version found", path);
    return { path, text: text.replace(pattern, `$1${version}$3`) };
  });
  for (const { path, text } of updates) writeFileSync(join(ROOT, path), text);
  console.log(`Wrote ${version} into ${FILES.length} version files.`);
}

const [command, version] = process.argv.slice(2);
if (!version || (command !== "check" && command !== "set")) fail(USAGE);
// Windows installers and macOS bundles only take numeric versions: pre-release
// builds carry their base version.
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`${version} is not X.Y.Z`);
if (command === "check") check(version);
else set(version);
