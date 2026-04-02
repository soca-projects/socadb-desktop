import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
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
const outfile = `dist/socadb-mcp-${os}-${arch}${ext}`;

mkdirSync("dist", { recursive: true });

console.log(`Compiling → ${outfile}`);
execFileSync("bun", ["build", "--compile", "src/index.ts", "--outfile", outfile], {
  stdio: "inherit",
});

console.log(`Done: ${outfile}`);
