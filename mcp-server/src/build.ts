import { execFileSync } from "node:child_process";
import { writeFileSync, copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { platform, arch } from "node:process";
import { resolve } from "node:path";
import { build } from "esbuild";

const NODE_SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

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
const outfile = `dist/socadb-mcp-${os}-${arch}${ext}`;

mkdirSync("dist", { recursive: true });

// Step 1: Bundle TypeScript into a single JS file with esbuild
console.log("Bundling TypeScript → dist/bundle.js");
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/bundle.js",
  sourcemap: false,
  minify: true,
});

// Step 2: Create Node SEA config
const seaConfig = {
  main: "dist/bundle.js",
  output: "dist/sea-prep.blob",
  disableExperimentalSEAWarning: true,
  useCodeCache: true,
};
writeFileSync("dist/sea-config.json", JSON.stringify(seaConfig));

// Step 3: Generate the SEA blob
console.log("Generating SEA blob");
execFileSync("node", ["--experimental-sea-config", "dist/sea-config.json"], {
  stdio: "inherit",
});

// Step 4: Copy the node binary and inject the blob
console.log(`Creating binary → ${outfile}`);
const nodeExe = process.execPath;
copyFileSync(nodeExe, outfile);

if (os !== "windows") {
  chmodSync(outfile, 0o755);
}

// Remove code signature on macOS before injecting
if (os === "darwin") {
  execFileSync("codesign", ["--remove-signature", outfile], { stdio: "inherit" });
}

// Inject the SEA blob
execFileSync("node", [
  resolve("node_modules/postject/dist/cli.js"),
  outfile, "NODE_SEA_BLOB", "dist/sea-prep.blob",
  "--sentinel-fuse", NODE_SEA_FUSE,
], { stdio: "inherit" });

// Re-sign on macOS
if (os === "darwin") {
  execFileSync("codesign", ["--sign", "-", outfile], { stdio: "inherit" });
}

console.log(`Done: ${outfile}`);
