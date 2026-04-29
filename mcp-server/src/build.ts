import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Pinned for reproducible builds. Bump alongside the `bun-version` in
// .github/workflows/release.yml so the runner bun matches the bundled bun.
const BUN_VERSION = "1.3.3";

type Os = "darwin" | "linux" | "windows";
type Arch = "arm64" | "x64";

function detectTarget(): { os: Os; arch: Arch } {
  const raw = process.env.BUN_TARGET;
  if (raw) {
    const match = raw.match(/^(darwin|linux|windows)-(arm64|x64)$/);
    if (!match) {
      throw new Error(
        `Invalid BUN_TARGET="${raw}" (expected <darwin|linux|windows>-<arm64|x64>)`,
      );
    }
    return { os: match[1] as Os, arch: match[2] as Arch };
  }
  const osMap: Record<string, Os> = { darwin: "darwin", linux: "linux", win32: "windows" };
  const os = osMap[process.platform];
  if (!os) throw new Error(`Unsupported platform: ${process.platform}`);
  const arch: Arch = process.arch === "arm64" ? "arm64" : "x64";
  return { os, arch };
}

const { os, arch } = detectTarget();
const ext = os === "windows" ? ".exe" : "";
const targetTag = `${os}-${arch}`;
const npmOs = os === "windows" ? "win32" : os;
const bunBuildTarget = `bun-${targetTag}`;
// Bun release artifacts use `aarch64`, not `arm64`.
const bunReleaseTag = `${os}-${arch === "arm64" ? "aarch64" : "x64"}`;

const mcpBinary = `socadb-mcp-${targetTag}${ext}`;
const mcpOutfile = `dist/${mcpBinary}`;

mkdirSync("dist", { recursive: true });

console.log(`[1/4] Compiling MCP server (--target=${bunBuildTarget}) → ${mcpOutfile}`);
execFileSync(
  "bun",
  [
    "build",
    "--compile",
    `--target=${bunBuildTarget}`,
    "src/index.ts",
    "--outfile",
    mcpOutfile,
  ],
  { stdio: "inherit" },
);

const runtimeDir = "dist/runtime";
console.log(`[2/4] Preparing runtime folder → ${runtimeDir}`);
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

cpSync(mcpOutfile, join(runtimeDir, mcpBinary), { dereference: true });
for (const file of [
  "agent-runner-claude.ts",
  "agent-runner-codex.ts",
  "agent-runner-shared.ts",
]) {
  cpSync(join("src", file), join(runtimeDir, file));
}

const minimalPkg = {
  name: "socadb-agent-runtime",
  private: true,
  type: "module",
  dependencies: JSON.parse(readFileSync("package.json", "utf-8")).dependencies,
};
writeFileSync(join(runtimeDir, "package.json"), JSON.stringify(minimalPkg, null, 2));

console.log(`[3/4] Copying runtime node_modules`);
const srcModules = "node_modules";
const dstModules = join(runtimeDir, "node_modules");
mkdirSync(dstModules, { recursive: true });

function copyPackage(pkgPath: string, options: { skipDirs?: string[]; required?: boolean } = {}) {
  const src = join(srcModules, pkgPath);
  if (!existsSync(src)) {
    if (options.required) {
      throw new Error(
        `Required package missing from node_modules: ${pkgPath} (run \`bun install\` first)`,
      );
    }
    console.warn(`  skip (missing): ${pkgPath}`);
    return;
  }
  const dst = join(dstModules, pkgPath);
  mkdirSync(dirname(dst), { recursive: true });
  const skip = new Set(options.skipDirs ?? []);
  cpSync(src, dst, {
    dereference: true,
    recursive: true,
    filter: (source: string) => {
      const rel = source.slice(src.length).replace(/^[\\/]/, "");
      const top = rel.split(/[\\/]/)[0];
      if (top && skip.has(top)) return false;
      return true;
    },
  });
  console.log(`  ok: ${pkgPath}`);
}

function readPackageVersion(pkgPath: string): string {
  const manifest = JSON.parse(
    readFileSync(join(srcModules, pkgPath, "package.json"), "utf-8"),
  );
  return manifest.version;
}

copyPackage("@anthropic-ai/claude-agent-sdk", { skipDirs: ["vendor"], required: true });
copyPackage("@openai/codex");
copyPackage("@openai/codex-sdk", { required: true });
copyPackage("zod", { required: true });
copyPackage("@modelcontextprotocol/sdk", { required: true });

// Cross-arch variants aren't installable via `bun add` (silently filtered by
// os/cpu), so for cross-compile we fetch the tarball from npm directly.
const sdkVersion = readPackageVersion("@anthropic-ai/claude-agent-sdk");
const codexVersion = readPackageVersion("@openai/codex");

const claudeVariant = `@anthropic-ai/claude-agent-sdk-${npmOs}-${arch}`;
const codexVariant = `@openai/codex-${npmOs}-${arch}`;

await Promise.all([
  // Each variant is its own npm package.
  ensurePlatformPackage({
    destPath: claudeVariant,
    npmName: claudeVariant,
    npmVersion: sdkVersion,
    expectedFile: `claude${ext}`,
  }),
  // Codex publishes variants as aliases of @openai/codex with a versioned tag.
  ensurePlatformPackage({
    destPath: codexVariant,
    npmName: "@openai/codex",
    npmVersion: `${codexVersion}-${npmOs}-${arch}`,
    expectedFile: "vendor",
  }),
]);
copyPackage(claudeVariant, { required: true });
copyPackage(codexVariant, { required: true });

console.log(`[4/4] Bundling Bun runtime (bun-${bunReleaseTag} v${BUN_VERSION})`);
const bunDest = join(runtimeDir, `bun${ext}`);
await downloadAndExtractBun(bunReleaseTag, BUN_VERSION, bunDest);
// 0755 so cargo can re-copy across rebuilds (no-op on Windows).
chmodSync(bunDest, 0o755);
console.log(`  ok: ${bunDest}`);

console.log(`Done.`);
console.log(`  Target:     ${targetTag}`);
console.log(`  MCP binary: ${mcpOutfile}`);
console.log(`  Runtime:    ${runtimeDir}`);

// Write to a tmp file then rename so a killed download doesn't poison the cache.
async function writeAtomic(target: string, data: Buffer) {
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, target);
}

// SRI = Subresource Integrity, npm's published format: "sha512-<base64>".
function verifySri(filePath: string, sri: string) {
  const [algo, expectedB64] = sri.split("-", 2);
  if (algo !== "sha512") {
    throw new Error(`Unsupported integrity algorithm: ${algo} (expected sha512)`);
  }
  const actual = createHash("sha512").update(readFileSync(filePath)).digest("base64");
  if (actual !== expectedB64) {
    rmSync(filePath, { force: true });
    throw new Error(
      `Integrity mismatch for ${filePath}: expected ${sri}, got sha512-${actual} ` +
        `(cache cleared, retry the build)`,
    );
  }
}

function verifySha256Hex(filePath: string, expectedHex: string) {
  const actual = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (actual !== expectedHex) {
    rmSync(filePath, { force: true });
    throw new Error(
      `SHA-256 mismatch for ${filePath}: expected ${expectedHex}, got ${actual} ` +
        `(cache cleared, retry the build)`,
    );
  }
}

async function fetchNpmIntegrity(npmName: string, npmVersion: string): Promise<string> {
  const url = `https://registry.npmjs.org/${npmName}/${npmVersion}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch npm metadata ${url}: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { dist?: { integrity?: string } };
  const integrity = data.dist?.integrity;
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    throw new Error(`No sha512 integrity in npm metadata for ${npmName}@${npmVersion}`);
  }
  return integrity;
}

async function fetchBunSha256(releaseTag: string, version: string): Promise<string> {
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/SHASUMS256.txt`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const filename = `bun-${releaseTag}.zip`;
  for (const line of (await res.text()).split("\n")) {
    const [hex, name] = line.trim().split(/\s+/);
    if (name === filename) return hex;
  }
  throw new Error(`SHA-256 for ${filename} not found in SHASUMS256.txt`);
}

async function ensurePlatformPackage(opts: {
  destPath: string;
  npmName: string;
  npmVersion: string;
  expectedFile: string;
}) {
  const dst = join(srcModules, opts.destPath);
  // Stricter reuse check: validate the actual payload, not just package.json
  // (a Ctrl+C mid-extraction could leave a half-extracted tree on disk).
  if (existsSync(join(dst, opts.expectedFile))) return;

  console.log(`  fetch (cross-arch): ${opts.npmName}@${opts.npmVersion} → ${opts.destPath}`);
  const cacheDir = join(tmpdir(), "socadb-pkg-cache");
  mkdirSync(cacheDir, { recursive: true });

  const integrity = await fetchNpmIntegrity(opts.npmName, opts.npmVersion);
  const basename = opts.npmName.split("/").pop()!;
  const tgzPath = join(cacheDir, `${basename}-${opts.npmVersion}.tgz`);
  if (!existsSync(tgzPath)) {
    const url = `https://registry.npmjs.org/${opts.npmName}/-/${basename}-${opts.npmVersion}.tgz`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    }
    await writeAtomic(tgzPath, Buffer.from(await res.arrayBuffer()));
  }
  verifySri(tgzPath, integrity);

  // Extract into staging, then atomically rename — partial extracts never end
  // up in the final path even if the script is killed mid-tar.
  const staging = `${dst}.staging-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  // --strip-components=1 drops the tarball's top-level `package/` dir.
  execFileSync("tar", ["-xzf", tgzPath, "-C", staging, "--strip-components=1"], {
    stdio: "inherit",
  });
  if (!existsSync(join(staging, opts.expectedFile))) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(
      `Extraction incomplete for ${opts.destPath}: ${opts.expectedFile} missing`,
    );
  }
  rmSync(dst, { recursive: true, force: true });
  renameSync(staging, dst);
}

async function downloadAndExtractBun(releaseTag: string, version: string, outBin: string) {
  const cacheDir = join(tmpdir(), "socadb-bun-cache");
  mkdirSync(cacheDir, { recursive: true });

  const expectedSha = await fetchBunSha256(releaseTag, version);
  const zipPath = join(cacheDir, `bun-${releaseTag}-v${version}.zip`);
  if (!existsSync(zipPath)) {
    const url = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-${releaseTag}.zip`;
    console.log(`  download: ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
    }
    await writeAtomic(zipPath, Buffer.from(await res.arrayBuffer()));
  } else {
    console.log(`  cached:   ${zipPath}`);
  }
  verifySha256Hex(zipPath, expectedSha);

  const extractDir = join(cacheDir, `extract-${releaseTag}-v${version}`);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  // bsdtar (built-in on macOS, Linux, Windows 10+) handles .zip natively.
  execFileSync("tar", ["-xf", zipPath, "-C", extractDir], { stdio: "inherit" });

  const innerName = releaseTag.startsWith("windows") ? "bun.exe" : "bun";
  const extracted = join(extractDir, `bun-${releaseTag}`, innerName);
  if (!existsSync(extracted)) {
    throw new Error(`Expected bun binary not found after extraction: ${extracted}`);
  }
  cpSync(extracted, outBin, { dereference: true });
}
