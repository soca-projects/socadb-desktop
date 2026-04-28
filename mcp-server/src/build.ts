import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { platform, arch } from "node:process";

const osMap: Record<string, string> = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

const os = osMap[platform];
if (!os) {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

const ext = os === "windows" ? ".exe" : "";
const arches = arch === "arm64" ? "arm64" : arch;
const mcpBinary = `socadb-mcp-${os}-${arches}${ext}`;
const mcpOutfile = `dist/${mcpBinary}`;

mkdirSync("dist", { recursive: true });

console.log(`[1/4] Compiling MCP server → ${mcpOutfile}`);
execFileSync("bun", ["build", "--compile", "src/index.ts", "--outfile", mcpOutfile], {
  stdio: "inherit",
});

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

function copyPackage(pkgPath: string, options: { skipDirs?: string[] } = {}) {
  const src = join(srcModules, pkgPath);
  if (!existsSync(src)) {
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
      const rel = source.slice(src.length).replace(/^\//, "");
      const top = rel.split("/")[0];
      if (top && skip.has(top)) return false;
      return true;
    },
  });
  console.log(`  ok: ${pkgPath}`);
}

copyPackage("@anthropic-ai/claude-agent-sdk", {
  skipDirs: ["vendor"],
});
copyPackage("@openai/codex");
copyPackage("@openai/codex-sdk");
copyPackage(`@openai/codex-${os}-${arches}`);
copyPackage("zod");
copyPackage("@modelcontextprotocol/sdk");

if (os === "darwin") {
  copyPackage(`@img/sharp-darwin-${arches}`);
  copyPackage(`@img/sharp-libvips-darwin-${arches}`);
}

console.log(`[4/4] Bundling Bun runtime`);
const bunSourcePath = (() => {
  try {
    return execFileSync("bun", ["--print", "process.execPath"], { encoding: "utf-8" }).trim();
  } catch {
    const which = execFileSync("which", ["bun"], { encoding: "utf-8" }).trim();
    return resolve(which);
  }
})();

const bunDest = join(runtimeDir, `bun${ext}`);
cpSync(bunSourcePath, bunDest, { dereference: true });
// Source bun (e.g. from Homebrew) is mode 0555. Make user-writable so cargo
// can re-copy/overwrite it across rebuilds without "permission denied".
execFileSync("chmod", ["0755", bunDest]);
console.log(`  ok: ${bunDest} (from ${bunSourcePath})`);

console.log(`Done.`);
console.log(`  MCP binary: ${mcpOutfile}`);
console.log(`  Runtime:    ${runtimeDir}`);
