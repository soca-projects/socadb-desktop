#!/usr/bin/env bun
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { APPIMAGE_PACKAGES, APPIMAGE_TOOLING, listedPackages } from "./appimage";
import {
  checkBundledPackages,
  dpkgOwners,
  dpkgPattern,
  elfSize,
} from "../src/utils/acknowledgments";

const USAGE = `Usage: bun scripts/check-appimage.ts [AppImage or extracted squashfs-root]
  Fails when the AppImage holds a file whose Ubuntu package is missing from
  src-tauri/linux/appimage-packages.txt, when its Acknowledgments.html doesn't
  credit a listed package, or when its runtime no longer matches the versions
  scripts/appimage.ts credits. Defaults to the AppImage tauri build wrote; an
  extracted folder has no runtime to check.`;

const ROOT = resolve(import.meta.dir, "..");
const NOT_FROM_PACKAGES = [
  // SocaDB's own files.
  /^usr\/libexec\/SocaDB\//,
  /^usr\/bin\/socadb-desktop$/,
  /^usr\/share\/applications\/SocaDB\.desktop$/,
  /^usr\/share\/icons\/hicolor\/[^/]+\/apps\/socadb-desktop\.png$/,
  /^SocaDB\.png$/,
  // linuxdeploy's, credited from APPIMAGE_TOOLING in scripts/acknowledgments.ts.
  /^AppRun(\.wrapped)?$/,
  /^apprun-hooks\//,
  // Caches built while bundling.
  /\/(loaders|immodules|giomodule)\.cache$/,
  /^usr\/share\/glib-2\.0\/schemas\/gschemas\.compiled$/,
  // The packages' copyright files, which linuxdeploy copies next to their libraries.
  /^usr\/share\/doc\//,
];

if (process.argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}

function locate(): { root: string; appimage?: string } {
  const given = process.argv[2];
  if (given && statSync(given).isDirectory()) return { root: given };
  const bundle = join(ROOT, "src-tauri/target/release/bundle/appimage");
  const appimage =
    given ?? join(bundle, readdirSync(bundle).find((f) => f.endsWith(".AppImage")) ?? "");
  const work = mkdtempSync(join(tmpdir(), "socadb-appimage-"));
  execFileSync(resolve(appimage), ["--appimage-extract"], { cwd: work, stdio: "ignore" });
  return { root: join(work, "squashfs-root"), appimage };
}

function runtimeText(appimage: string): string {
  const fd = openSync(appimage, "r");
  try {
    const header = Buffer.alloc(64);
    readSync(fd, header, 0, 64, 0);
    const runtime = Buffer.alloc(elfSize(header));
    readSync(fd, runtime, 0, runtime.length, 0);
    return runtime.toString("latin1");
  } finally {
    closeSync(fd);
  }
}

const { root, appimage } = locate();
const runtime = appimage ? runtimeText(appimage) : undefined;
const staleRuntime = runtime
  ? APPIMAGE_TOOLING.filter(({ marker }) => marker && !runtime.includes(marker))
  : [];
const files = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(root, join(entry.parentPath, entry.name)))
  .filter((path) => !NOT_FROM_PACKAGES.some((pattern) => pattern.test(path)));

const search = spawnSync("dpkg", ["-S", ...new Set(files.map(dpkgPattern))], {
  encoding: "utf-8",
  maxBuffer: 64 * 1024 * 1024,
});
if (search.error) throw new Error(`dpkg: ${search.error.message}`);

const listed = listedPackages();
const { unowned, missing, unused } = checkBundledPackages(
  files,
  dpkgOwners(search.stdout),
  listed,
);

const pagePath = join(root, "usr/libexec/SocaDB/Acknowledgments.html");
const page = existsSync(pagePath) ? readFileSync(pagePath, "utf-8") : undefined;
const uncredited = page ? listed.filter((pkg) => !page.includes(`>${pkg} `)) : [];

for (const pkg of unused) {
  console.log(
    `::warning::${pkg} is listed in ${APPIMAGE_PACKAGES} but the AppImage no longer holds its files`,
  );
}
const errors = [
  ...(page ? [] : ["the AppImage has no usr/libexec/SocaDB/Acknowledgments.html"]),
  ...missing.map(
    ({ pkg, file }) => `${file} comes from ${pkg}: add it to ${APPIMAGE_PACKAGES}`,
  ),
  ...unowned.map((file) => `${file}: no Ubuntu package owns it, credit it by hand`),
  ...uncredited.map(
    (pkg) => `${pkg} is listed but Acknowledgments.html doesn't credit it`,
  ),
  ...staleRuntime.map(
    ({ name, marker }) =>
      `the AppImage runtime no longer contains "${marker}": update ${name} in scripts/appimage.ts`,
  ),
];
if (errors.length > 0) {
  console.error(errors.map((error) => `::error::${error}`).join("\n"));
  process.exit(1);
}
console.log(
  `AppImage: ${files.length} files from ${listed.length - unused.length} listed packages, all credited; ` +
    (runtime ? "runtime matches its credits" : "runtime not checked"),
);
