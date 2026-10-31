#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  chooseLicenses,
  groupAttributions,
  isLicenseFileName,
  isNoticeFileName,
  licenseName,
  packageOfModule,
  pickLicenseFiles,
  renderAcknowledgments,
  renderPlaceholder,
  sourceUrl,
  viteNotices,
  type Attribution,
  type Component,
  type Notice,
} from "../src/utils/acknowledgments";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "build/Acknowledgments.html");

if (process.argv.includes("--dev")) {
  if (!existsSync(OUT)) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, renderPlaceholder());
  }
  process.exit(0);
}

const RUST_TARGETS: Record<string, string> = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "windows-x64": "x86_64-pc-windows-msvc",
};

const LICENSE_FIELD_OVERRIDES: { match: RegExp; license: string }[] = [
  // "SEE LICENSE IN …": the Agent SDK and its native Claude Code CLI are
  // Anthropic's, redistributed under its Commercial Terms.
  {
    match: /^@anthropic-ai\/claude-agent-sdk(-\w+-\w+)?$/,
    license: "LicenseRef-Anthropic",
  },
];

// Read at the tag of the bundled version, so the text matches what ships.
const MISSING_LICENSE_FILES: {
  match: RegExp;
  urls: (match: RegExpMatchArray, version: string) => string[];
}[] = [
  {
    match: /^@tauri-apps\/plugin-([\w-]+)$/,
    urls: ([, plugin], version) => [
      `https://raw.githubusercontent.com/tauri-apps/plugins-workspace/${plugin}-js-v${version}/plugins/${plugin}/LICENSE_MIT`,
    ],
  },
  {
    // The author added the MIT file only in 2025, after the last release.
    match: /^html-parse-stringify$/,
    urls: () => [
      "https://raw.githubusercontent.com/henrikjoreteg/html-parse-stringify/a2659e6eac3603ba8b46958e0bd35b337108261f/LICENSE",
    ],
  },
  {
    // The platform package carries the CLI as "<version>-<os>-<arch>".
    match: /^@openai\/codex$/,
    urls: (_, version) =>
      ["LICENSE", "NOTICE"].map(
        (file) =>
          `https://raw.githubusercontent.com/openai/codex/rust-v${version.split("-")[0]}/${file}`,
      ),
  },
];

const NESTED_LICENSE_FILES: Record<string, string[]> = {
  // Preflight, which Tailwind copies into our CSS, keeps its authors' notice.
  tailwindcss: ["src/css/LICENSE"],
};

const CargoAboutZ = z.object({
  licenses: z.array(
    z.object({
      name: z.string(),
      text: z.string(),
      used_by: z.array(
        z.object({
          crate: z.object({
            name: z.string(),
            version: z.string(),
            source: z.string().nullish(),
            repository: z.string().nullish(),
            manifest_path: z.string(),
          }),
        }),
      ),
    }),
  ),
});

const CargoMetadataZ = z.object({
  packages: z.array(
    z.object({ name: z.string(), publish: z.array(z.string()).nullable() }),
  ),
});

const PackageJsonZ = z.object({
  name: z.string(),
  version: z.string(),
  license: z.union([z.string(), z.object({ type: z.string() })]).optional(),
  repository: z.unknown().optional(),
});

const AboutTomlZ = z.object({ accepted: z.array(z.string()) });

const problems: string[] = [];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url).catch((e: unknown) => e);
    if (res instanceof Response && res.ok) return res.text();
    const transient =
      !(res instanceof Response) || res.status === 429 || res.status >= 500;
    if (!transient || attempt === 3) {
      const reason =
        res instanceof Response ? `${res.status} ${res.statusText}` : String(res);
      throw new Error(`${url}: ${reason}`);
    }
    await Bun.sleep(attempt * 2000);
  }
}

const HOST_OS: Record<string, string> = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

function detectTarget(): string {
  const target = process.env.BUN_TARGET ?? `${HOST_OS[process.platform]}-${process.arch}`;
  if (!RUST_TARGETS[target]) throw new Error(`Unsupported target: ${target}`);
  return target;
}

function crateAttributions(target: string): Attribution[] {
  const pinned = readFileSync(join(ROOT, ".github/workflows/build.yml"), "utf-8").match(
    /tool:\s*cargo-about@(\S+)/,
  )?.[1];
  let local: string;
  try {
    local = execFileSync("cargo", ["about", "--version"], { encoding: "utf-8" })
      .trim()
      .split(" ")[1];
  } catch {
    throw new Error(
      `cargo-about is missing: cargo install cargo-about --locked --version ${pinned}`,
    );
  }
  if (local !== pinned) {
    console.warn(
      `Warning: cargo-about ${local} here, releases use ${pinned} (.github/workflows/build.yml)`,
    );
  }
  const cargo = (args: string[]) =>
    JSON.parse(
      execFileSync(
        "cargo",
        [...args, "--locked", "--manifest-path", join(ROOT, "src-tauri/Cargo.toml")],
        {
          encoding: "utf-8",
          maxBuffer: 256 * 1024 * 1024,
          stdio: ["ignore", "pipe", "inherit"],
        },
      ),
    );
  // about.toml leaves out crates with publish = false to skip the app itself,
  // and cargo-about would drop any dependency marked so without a word.
  const metadata = CargoMetadataZ.parse(
    cargo([
      "metadata",
      "--format-version",
      "1",
      "--filter-platform",
      RUST_TARGETS[target],
    ]),
  );
  for (const pkg of metadata.packages) {
    if (pkg.name !== "socadb-desktop" && pkg.publish?.length === 0) {
      problems.push(`${pkg.name}: publish = false, so cargo-about would leave it out`);
    }
  }
  const report = CargoAboutZ.parse(
    cargo([
      "about",
      "generate",
      "--format",
      "json",
      "--fail",
      "--target",
      RUST_TARGETS[target],
    ]),
  );
  const attributions: Attribution[] = [];
  const crateDirs = new Map<string, Component>();
  for (const license of report.licenses) {
    for (const { crate } of license.used_by) {
      const component: Component = {
        name: crate.name,
        version: crate.version,
        kind: "crate",
        url:
          sourceUrl(crate.repository) ??
          (crate.source?.startsWith("registry+")
            ? `https://crates.io/crates/${crate.name}/${crate.version}`
            : undefined),
      };
      crateDirs.set(dirname(crate.manifest_path), component);
      attributions.push({
        component,
        notices: [{ name: license.name, text: license.text }],
      });
    }
  }
  // Apache-2.0 asks to pass on NOTICE files, which cargo-about doesn't read.
  for (const [dir, component] of crateDirs) {
    const notices = readdirSync(dir)
      .filter(isNoticeFileName)
      .map((file) => ({ name: "NOTICE", text: readFileSync(join(dir, file), "utf-8") }));
    if (notices.length > 0) attributions.push({ component, notices });
  }
  return attributions;
}

function bundledPackageDirs(): string[] {
  const frontend = join(ROOT, "build/frontend-modules.json");
  const mcp = join(ROOT, "mcp-server/dist/metafile.json");
  for (const [path, command] of [
    [frontend, "bun run build"],
    [mcp, "bun run build:mcp"],
  ]) {
    if (!existsSync(path))
      throw new Error(`${path} is missing: run \`${command}\` first`);
  }
  const modules = [
    ...z.object({ modules: z.array(z.string()) }).parse(readJson(frontend)).modules,
    ...Object.keys(
      z.object({ inputs: z.record(z.string(), z.unknown()) }).parse(readJson(mcp)).inputs,
    ).map((input) => join(ROOT, "mcp-server", input)),
  ];
  const dirs = new Set(modules.flatMap((id) => packageOfModule(id)?.dir ?? []));
  // Rollup's virtual modules: Vite's preload polyfill and the CommonJS helpers.
  if (modules.some((id) => /^\0(vite\/|commonjs)/.test(id)))
    dirs.add(join(ROOT, "node_modules/vite"));
  // Tailwind writes its preflight into our CSS through PostCSS, out of any module list.
  dirs.add(join(ROOT, "node_modules/tailwindcss"));
  return [...dirs];
}

function runtimePackageDirs(): string[] {
  const modules = join(ROOT, "mcp-server/dist/runtime/node_modules");
  return readdirSync(modules).flatMap((entry) =>
    entry.startsWith("@")
      ? readdirSync(join(modules, entry)).map((name) => join(modules, entry, name))
      : [join(modules, entry)],
  );
}

async function npmAttribution(
  dir: string,
  accepted: string[],
): Promise<Attribution | null> {
  const pkg = PackageJsonZ.parse(readJson(join(dir, "package.json")));
  const component: Component = {
    name: pkg.name,
    version: pkg.version,
    kind: "npm",
    url:
      sourceUrl(pkg.repository) ??
      `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`,
  };
  const label = `${pkg.name}@${pkg.version}`;
  if (pkg.name === "vite") {
    return {
      component,
      notices: viteNotices(readFileSync(join(dir, "LICENSE.md"), "utf-8")),
    };
  }
  const expression =
    LICENSE_FIELD_OVERRIDES.find(({ match }) => match.test(pkg.name))?.license ??
    (typeof pkg.license === "object" ? pkg.license.type : pkg.license);
  const chosen = expression ? chooseLicenses(expression, accepted) : null;
  if (!chosen) {
    problems.push(
      `${label}: license "${expression ?? "(none)"}" isn't accepted (src-tauri/about.toml)`,
    );
    return null;
  }
  const name = chosen.map(licenseName).join(" AND ");
  const files = readdirSync(dir).filter(isLicenseFileName);
  const read = (file: string): Notice => ({
    name: isNoticeFileName(file) ? "NOTICE" : name,
    text: readFileSync(join(dir, file), "utf-8"),
  });
  const licenseFiles = files.filter((file) => !isNoticeFileName(file));
  const notices = [
    ...pickLicenseFiles(licenseFiles, chosen).map(read),
    ...files.filter(isNoticeFileName).map(read),
    ...(NESTED_LICENSE_FILES[pkg.name] ?? []).map(read),
  ];
  if (licenseFiles.length === 0) {
    const remote = MISSING_LICENSE_FILES.flatMap(({ match, urls }) => {
      const found = pkg.name.match(match);
      return found ? urls(found, pkg.version) : [];
    });
    if (remote.length === 0) {
      problems.push(
        `${label}: no license file in the package; add it to MISSING_LICENSE_FILES`,
      );
      return null;
    }
    for (const url of remote) {
      notices.push({
        name: url.endsWith("/NOTICE") ? "NOTICE" : name,
        text: await fetchText(url),
      });
    }
  }
  return { component, notices };
}

async function otherAttributions(target: string): Promise<Attribution[]> {
  const codexVersion = PackageJsonZ.parse(
    readJson(join(ROOT, "mcp-server/node_modules/@openai/codex/package.json")),
  ).version;
  const sparkleVersion = readFileSync(
    join(ROOT, "scripts/macos/download-sparkle.sh"),
    "utf-8",
  ).match(/^VERSION="([^"]+)"/m)?.[1];
  const other = (name: string, version: string, url: string): Component => ({
    name,
    version,
    kind: "other",
    url,
  });
  const sources: { component: Component; name: string; url: string }[] = [
    {
      component: other("Bun", Bun.version, "https://github.com/oven-sh/bun"),
      name: "MIT License, with linked libraries",
      url: `https://raw.githubusercontent.com/oven-sh/bun/bun-v${Bun.version}/LICENSE.md`,
    },
    ...(target.startsWith("darwin-")
      ? [
          {
            component: other(
              "Sparkle",
              sparkleVersion ?? "",
              "https://github.com/sparkle-project/Sparkle",
            ),
            name: "MIT License, with external licenses",
            url: `https://raw.githubusercontent.com/sparkle-project/Sparkle/${sparkleVersion}/LICENSE`,
          },
        ]
      : []),
    ...(target.startsWith("linux-")
      ? [
          {
            component: other(
              `bubblewrap (in Codex ${codexVersion})`,
              "",
              `https://github.com/openai/codex/tree/rust-v${codexVersion}/codex-rs/vendor/bubblewrap`,
            ),
            name: licenseName("LGPL-2.0-or-later"),
            url: `https://raw.githubusercontent.com/openai/codex/rust-v${codexVersion}/codex-rs/vendor/bubblewrap/COPYING`,
          },
        ]
      : []),
  ];
  if (target.startsWith("darwin-") && !sparkleVersion) {
    throw new Error("No VERSION in scripts/macos/download-sparkle.sh");
  }
  const fetched = await Promise.all(
    sources.map(async ({ component, name, url }) => ({
      component,
      notices: [{ name, text: await fetchText(url) }],
    })),
  );
  const fonts: Attribution[] = [
    {
      component: other("IBM Plex Mono", "", "https://github.com/IBM/plex"),
      notices: [
        {
          name: licenseName("OFL-1.1"),
          text: readFileSync(
            join(ROOT, "src/assets/fonts/IBMPlexMono-LICENSE.txt"),
            "utf-8",
          ),
        },
      ],
    },
    {
      component: other("Satoshi", "", "https://www.fontshare.com/fonts/satoshi"),
      notices: [
        {
          name: "ITF Free Font License",
          text: "Satoshi is designed by Indian Type Foundry and used under the ITF Free Font License:\nhttps://www.fontshare.com/licenses/itf-ffl",
        },
      ],
    },
  ];
  return [...fetched, ...fonts];
}

const target = detectTarget();
const { accepted } = AboutTomlZ.parse(
  Bun.TOML.parse(readFileSync(join(ROOT, "src-tauri/about.toml"), "utf-8")),
);
const npmAccepted = [...accepted, "LicenseRef-Anthropic"];
const npm = await Promise.all(
  [...new Set([...bundledPackageDirs(), ...runtimePackageDirs()])].map((dir) =>
    npmAttribution(dir, npmAccepted),
  ),
);
const attributions = [
  ...crateAttributions(target),
  ...npm.filter((attribution) => attribution !== null),
  ...(await otherAttributions(target)),
];
if (problems.length > 0) {
  console.error(`Unresolved licenses:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

const version = PackageJsonZ.parse(readJson(join(ROOT, "package.json"))).version;
const html = renderAcknowledgments({ version, groups: groupAttributions(attributions) });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
const count = (kind: string) =>
  new Set(
    attributions.filter((a) => a.component.kind === kind).map((a) => a.component.name),
  ).size;
console.log(
  `Acknowledgments (${target}): ${count("crate")} crates, ${count("npm")} npm packages, ${count("other")} others, ` +
    `${Math.round(Buffer.byteLength(html) / 1024)} KB → ${OUT}`,
);
