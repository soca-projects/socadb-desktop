import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

const mcpBinary = `socadb-mcp-${targetTag}${ext}`;
const mcpOutfile = `dist/${mcpBinary}`;
const serverVersion: string = JSON.parse(readFileSync("package.json", "utf-8")).version;

mkdirSync("dist", { recursive: true });

const releaseBun = readFileSync("../.github/workflows/build.yml", "utf-8").match(/bun-version:\s*(\S+)/)?.[1];
const localBun = execFileSync("bun", ["--version"], { encoding: "utf-8" }).trim();
if (localBun !== releaseBun) {
  console.warn(`Warning: Bun ${localBun} compiles the agents here, releases use Bun ${releaseBun} (.github/workflows/build.yml)`);
}

console.log(`[1/3] Compiling MCP server (--target=${bunBuildTarget}) → ${mcpOutfile}`);
execFileSync(
  "bun",
  [
    "build",
    "--compile",
    // The user's own Claude Code or Codex starts the server in their project folder.
    "--no-compile-autoload-bunfig",
    "--no-compile-autoload-dotenv",
    `--target=${bunBuildTarget}`,
    "--define",
    `process.env.SOCADB_VERSION=${JSON.stringify(serverVersion)}`,
    "src/index.ts",
    "--outfile",
    mcpOutfile,
  ],
  { stdio: "inherit" },
);

const runtimeDir = "dist/runtime";
console.log(`[2/3] Preparing runtime folder → ${runtimeDir}`);
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

console.log(`[3/3] Copying the agent CLIs`);
const srcModules = "node_modules";
const dstModules = join(runtimeDir, "node_modules");
mkdirSync(dstModules, { recursive: true });

function copyPackage(pkgPath: string, skip?: (parts: string[]) => boolean) {
  const src = join(srcModules, pkgPath);
  if (!existsSync(src)) {
    throw new Error(
      `Required package missing from node_modules: ${pkgPath} (run \`bun install\` first)`,
    );
  }
  const dst = join(dstModules, pkgPath);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, {
    dereference: true,
    recursive: true,
    filter: (source: string) =>
      !skip?.(source.slice(src.length).replace(/^[\\/]/, "").split(/[\\/]/)),
  });
  console.log(`  ok: ${pkgPath}`);
}

function readPackageVersion(pkgPath: string): string {
  const manifest = JSON.parse(
    readFileSync(join(srcModules, pkgPath, "package.json"), "utf-8"),
  );
  return manifest.version;
}

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
copyPackage(claudeVariant);
// `codex exec` runs here without a shell: the voice host, the patched zsh and ripgrep
// (used only by the shell tool, `codex doctor` and the desktop app's thread search)
// never start. bwrap and the Windows sandbox helpers stay: the read-only sandbox needs them.
copyPackage(codexVariant, (parts) => {
  const resource = parts[parts.indexOf("codex-resources") + 1];
  const onPath = parts[parts.indexOf("codex-path") + 1];
  return (
    (parts.includes("codex-resources") && (resource === "voice" || resource === "zsh")) ||
    (parts.includes("codex-path") && (onPath === "rg" || onPath === "rg.exe"))
  );
});

// Vendor signatures would tie the sealed app to certificates we don't control:
// Apple revoking one (it happened to codex twice) gets the whole app blocked
// as malware at launch.
if (os === "darwin") {
  if (process.platform !== "darwin") {
    throw new Error("A macOS runtime can only be built on macOS (it must be re-signed)");
  }
  const identity = process.env.APPLE_SIGNING_IDENTITY;
  console.log(identity ? `Signing bundled binaries as ${identity}` : `Ad-hoc signing bundled binaries`);
  console.log(`  ok: ${signMachOs("dist", identity)} binaries`);
}

console.log(`Done.`);
console.log(`  Target:     ${targetTag}`);
console.log(`  MCP binary: ${mcpOutfile}`);
console.log(`  Runtime:    ${runtimeDir}`);

function isMachO(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(8);
    if (readSync(fd, head, 0, 8, 0) < 8) return false;
    const magic = head.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) return true;
    // Fat binaries share 0xcafebabe with Java class files; a fat header's
    // second word is a small architecture count, a class file's is a version.
    return magic === 0xcafebabe && head.readUInt32BE(4) < 32;
  } finally {
    closeSync(fd);
  }
}

// Tauri signs the app and its frameworks but not resources, so the notary
// service would reject these binaries unless they carry the Developer ID,
// a timestamp and the hardened runtime. Under that runtime the Bun-compiled
// ones (claude, socadb-mcp) can't JIT without runtime.entitlements.
function signMachOs(dir: string, identity: string | undefined): number {
  const args = identity
    ? ["--force", "--sign", identity, "--options", "runtime", "--timestamp", "--entitlements", "runtime.entitlements"]
    : ["--force", "--sign", "-"];
  let count = 0;
  for (const rel of readdirSync(dir, { recursive: true }) as string[]) {
    const path = join(dir, rel);
    if (!lstatSync(path).isFile() || !isMachO(path)) continue;
    execFileSync("codesign", [...args, path], { stdio: "pipe" });
    execFileSync("codesign", ["--verify", "--strict", path], { stdio: "pipe" });
    count++;
  }
  return count;
}

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


function installedVersion(pkgDir: string): string | undefined {
  try {
    return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf-8")).version;
  } catch {
    return undefined;
  }
}

async function ensurePlatformPackage(opts: {
  destPath: string;
  npmName: string;
  npmVersion: string;
  expectedFile: string;
}) {
  const dst = join(srcModules, opts.destPath);
  // Stricter reuse check: validate the actual payload, not just package.json
  // (a Ctrl+C mid-extraction could leave a half-extracted tree on disk). The
  // version check matters too: bumping the SDK must not keep a stale variant.
  if (
    existsSync(join(dst, opts.expectedFile)) &&
    installedVersion(dst) === opts.npmVersion
  ) {
    return;
  }

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

