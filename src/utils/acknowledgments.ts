export interface Component {
  name: string;
  version: string;
  kind: "crate" | "npm" | "appimage" | "other";
  url?: string;
}

export interface Notice {
  name: string;
  text: string;
}

export interface Attribution {
  component: Component;
  notices: Notice[];
}

export interface LicenseGroup {
  name: string;
  text: string;
  components: Component[];
}

const LICENSE_NAMES: Record<string, string> = {
  "0BSD": "BSD Zero Clause License",
  "Apache-2.0": "Apache License 2.0",
  "BSD-2-Clause": 'BSD 2-Clause "Simplified" License',
  "BSD-3-Clause": 'BSD 3-Clause "New" or "Revised" License',
  "CC0-1.0": "Creative Commons Zero v1.0 Universal",
  "EPL-2.0": "Eclipse Public License 2.0",
  ISC: "ISC License",
  "LGPL-2.0-or-later": "GNU Library General Public License v2 or later",
  "LicenseRef-Anthropic": "Anthropic Legal Agreements",
  MIT: "MIT License",
  "MPL-2.0": "Mozilla Public License 2.0",
  "OFL-1.1": "SIL Open Font License 1.1",
  "Unicode-3.0": "Unicode License v3",
  Zlib: "zlib License",
};

export function licenseName(id: string): string {
  return LICENSE_NAMES[id] ?? id;
}

const COMMON_LICENSE_NAMES: Record<string, string> = {
  Artistic: "Artistic License 1.0",
  BSD: "BSD License (University of California)",
  "GFDL-1.2": "GNU Free Documentation License v1.2",
  "GFDL-1.3": "GNU Free Documentation License v1.3",
  "GPL-1": "GNU General Public License v1.0",
  "GPL-2": "GNU General Public License v2.0",
  "GPL-3": "GNU General Public License v3.0",
  "LGPL-2": "GNU Library General Public License v2",
  "LGPL-2.1": "GNU Lesser General Public License v2.1",
  "LGPL-3": "GNU Lesser General Public License v3.0",
  "MPL-1.1": "Mozilla Public License 1.1",
};

export function commonLicenseName(file: string): string {
  return COMMON_LICENSE_NAMES[file] ?? licenseName(file);
}

type Expression = { id: string } | { and: Expression[] } | { or: Expression[] };

function parseExpression(source: string): Expression {
  const tokens = source.match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;
  const fail = (): never => {
    throw new Error(`Not an SPDX expression: "${source}"`);
  };
  const term = (): Expression => {
    const token = tokens[at++] ?? fail();
    if (token === "(") {
      const inner = or();
      if (tokens[at++] !== ")") fail();
      return inner;
    }
    if (token === ")" || token === "AND" || token === "OR" || token === "WITH") fail();
    if (tokens[at] !== "WITH") return { id: token };
    at++;
    const exception = tokens[at++] ?? fail();
    return { id: `${token} WITH ${exception}` };
  };
  const and = (): Expression => {
    const parts = [term()];
    while (tokens[at] === "AND") {
      at++;
      parts.push(term());
    }
    return parts.length === 1 ? parts[0] : { and: parts };
  };
  const or = (): Expression => {
    const parts = [and()];
    while (tokens[at] === "OR") {
      at++;
      parts.push(and());
    }
    return parts.length === 1 ? parts[0] : { or: parts };
  };
  const expression = or();
  if (at !== tokens.length) fail();
  return expression;
}

function choose(expression: Expression, accepted: readonly string[]): string[] | null {
  if ("id" in expression)
    return accepted.includes(expression.id) ? [expression.id] : null;
  if ("and" in expression) {
    const parts = expression.and.map((part) => choose(part, accepted));
    return parts.every((part) => part !== null) ? parts.flat() : null;
  }
  const rank = (ids: string[]) => Math.min(...ids.map((id) => accepted.indexOf(id)));
  const options = expression.or
    .map((part) => choose(part, accepted))
    .filter((part) => part !== null);
  return options.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function chooseLicenses(
  expression: string,
  accepted: readonly string[],
): string[] | null {
  try {
    return choose(parseExpression(expression), accepted);
  } catch {
    return null;
  }
}

export function packageOfModule(id: string): { dir: string; name: string } | null {
  const path = id.replace(/^\0/, "").split("?")[0].replaceAll("\\", "/");
  const marker = path.lastIndexOf("node_modules/");
  if (marker === -1 || (marker > 0 && path[marker - 1] !== "/")) return null;
  const start = marker + "node_modules/".length;
  const [first, second] = path.slice(start).split("/");
  const name = first.startsWith("@") && second ? `${first}/${second}` : first;
  if (!name) return null;
  return { dir: path.slice(0, start) + name, name };
}

export function isLicenseFileName(file: string): boolean {
  return (
    /^(licen[cs]e|copying|notice)/i.test(file) &&
    !/\.(js|cjs|mjs|ts|json|map|spdx)$/i.test(file)
  );
}

export function isNoticeFileName(file: string): boolean {
  return /^notice/i.test(file);
}

export function pickLicenseFiles(files: string[], chosen: string[]): string[] {
  if (files.length < 2 || chosen.length !== 1) return files;
  const key = chosen[0].split("-")[0].toLowerCase();
  const matching = files.filter((file) => file.toLowerCase().includes(key));
  return matching.length > 0 ? matching : files;
}

export function parsePackageList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function commonLicensesIn(copyright: string): string[] {
  const names = [...copyright.matchAll(/\/usr\/share\/common-licenses\/([\w.+-]+)/g)].map(
    ([, name]) => name.replace(/\.+$/, ""),
  );
  return [...new Set(names)];
}

export function dpkgOwners(dpkgSearch: string): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const line of dpkgSearch.split("\n")) {
    const at = line.indexOf(": /");
    if (at === -1 || /^(local )?diversion /.test(line)) continue;
    const packages = line
      .slice(0, at)
      .split(", ")
      .map((pkg) => pkg.replace(/:[\w-]+$/, ""));
    const path = line.slice(at + 2);
    owners.set(path, [...new Set([...(owners.get(path) ?? []), ...packages])]);
  }
  return owners;
}

// linuxdeploy flattens libraries into usr/lib, but copies shared data to the
// same path as on the build machine.
export function dpkgPattern(file: string): string {
  const literal = (text: string) => text.replace(/[[\]*?\\]/g, "\\$&");
  return file.startsWith("usr/share/")
    ? `/${literal(file)}`
    : `*/${literal(file.split("/").pop() ?? file)}`;
}

function ownersOf(file: string, owners: Map<string, string[]>): string[] {
  if (file.startsWith("usr/share/")) return owners.get(`/${file}`) ?? [];
  const name = `/${file.split("/").pop()}`;
  return [...owners].filter(([path]) => path.endsWith(name)).flatMap(([, pkgs]) => pkgs);
}

export function elfSize(header: Uint8Array): number {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  return (
    Number(view.getBigUint64(0x28, true)) +
    view.getUint16(0x3a, true) * view.getUint16(0x3c, true)
  );
}

export function checkBundledPackages(
  files: string[],
  owners: Map<string, string[]>,
  listed: string[],
): { unowned: string[]; missing: { pkg: string; file: string }[]; unused: string[] } {
  const unowned: string[] = [];
  const missing: { pkg: string; file: string }[] = [];
  const used = new Set<string>();
  for (const file of files) {
    const candidates = ownersOf(file, owners);
    const covered = candidates.filter((pkg) => listed.includes(pkg));
    if (candidates.length === 0) unowned.push(file);
    else if (covered.length === 0) missing.push({ pkg: candidates[0], file });
    for (const pkg of covered) used.add(pkg);
  }
  return { unowned, missing, unused: listed.filter((pkg) => !used.has(pkg)) };
}

export function sourceUrl(repository: unknown): string | undefined {
  const raw =
    typeof repository === "string"
      ? repository
      : typeof repository === "object" && repository !== null && "url" in repository
        ? repository.url
        : undefined;
  if (typeof raw !== "string") return undefined;
  if (/^(github:)?[\w.-]+\/[\w.-]+$/.test(raw)) {
    return `https://github.com/${raw.replace(/^github:/, "")}`;
  }
  const url = raw
    .replace(/^git\+/, "")
    .replace(/^(git|ssh):\/\/(git@)?/, "https://")
    .replace(/\.git(?=#|$)/, "");
  return /^https?:\/\//.test(url) ? url : undefined;
}

/**
 * Vite's LICENSE.md also carries the licenses of everything Vite bundles for
 * itself. Our bundle only holds Vite's preload polyfill and the CommonJS
 * helpers of @rollup/plugin-commonjs.
 */
export function viteNotices(licenseMd: string): Notice[] {
  const text = licenseMd.replace(/\r\n?/g, "\n");
  const core = text
    .match(/^# Vite core license\n([\s\S]*?)^# /m)?.[1]
    .replace(/^Vite is released under the MIT license:\n/, "");
  const commonjs = text
    .match(
      /^## [^\n]*@rollup\/plugin-commonjs[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m,
    )?.[1]
    .split("\n")
    .filter((line) => line.startsWith(">"))
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n");
  if (!core?.trim() || !commonjs?.trim()) {
    throw new Error("Vite's LICENSE.md changed: update viteNotices()");
  }
  return [
    { name: licenseName("MIT"), text: core },
    { name: licenseName("MIT"), text: commonjs },
  ];
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function componentKey(component: Component): string {
  return `${component.kind}:${component.name}@${component.version}`;
}

function compareComponents(a: Component, b: Component): number {
  return (
    a.name.localeCompare(b.name) ||
    a.version.localeCompare(b.version, undefined, { numeric: true })
  );
}

export function groupAttributions(attributions: Attribution[]): LicenseGroup[] {
  const groups = new Map<string, LicenseGroup>();
  const seen = new Set<string>();
  for (const { component, notices } of attributions) {
    for (const notice of notices) {
      const text = normalizeText(notice.text);
      const key = `${componentKey(component)}\n${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const group = groups.get(text);
      if (group) group.components.push(component);
      else groups.set(text, { name: notice.name, text, components: [component] });
    }
  }
  const counts = new Map<string, number>();
  for (const group of groups.values()) {
    counts.set(group.name, (counts.get(group.name) ?? 0) + group.components.length);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, components: group.components.sort(compareComponents) }))
    .sort(
      (a, b) =>
        (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) ||
        a.name.localeCompare(b.name) ||
        b.components.length - a.components.length ||
        compareComponents(a.components[0], b.components[0]),
    );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const KIND_LABELS: Record<Component["kind"], string | null> = {
  crate: "Rust",
  npm: "npm",
  appimage: "AppImage",
  other: null,
};

const STYLE = `
:root { color-scheme: light dark; --text: #1d1c1a; --muted: #6b6760; --line: #e4e0d8; --panel: #f6f3ec; --link: #2f5fb3; }
@media (prefers-color-scheme: dark) { :root { --text: #ebe8e2; --muted: #a29d94; --line: #3a3833; --panel: #252420; --link: #8db1f0; } }
body { margin: 0; background: Canvas; color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
main { max-width: 880px; margin: 0 auto; padding: 40px 24px 64px; }
h1 { font-size: 26px; margin: 0 0 8px; }
h2 { font-size: 18px; margin: 40px 0 12px; }
h3 { font-size: 15px; margin: 0 0 8px; }
p { margin: 0 0 12px; color: var(--muted); }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.overview { columns: 2 260px; padding-left: 20px; }
section { border-top: 1px solid var(--line); padding: 24px 0 8px; }
.components { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 14px; }
.kind { color: var(--muted); font-size: 12px; }
pre { background: var(--panel); border-radius: 8px; padding: 16px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

function renderComponent(component: Component): string {
  const label = escapeHtml(`${component.name} ${component.version}`.trim());
  const name = component.url
    ? `<a href="${escapeHtml(component.url)}">${label}</a>`
    : label;
  const kind = KIND_LABELS[component.kind];
  return `<li>${name}${kind ? ` <span class="kind">${kind}</span>` : ""}</li>`;
}

export function renderAcknowledgments({
  version,
  groups,
}: {
  version: string;
  groups: LicenseGroup[];
}): string {
  const overview = new Map<string, { anchor: string; count: number }>();
  const sections = groups.map((group, index) => {
    const anchor = `license-${index + 1}`;
    const entry = overview.get(group.name);
    if (entry) entry.count += group.components.length;
    else overview.set(group.name, { anchor, count: group.components.length });
    return `<section id="${anchor}">
<h3>${escapeHtml(group.name)}</h3>
<ul class="components">${group.components.map(renderComponent).join("")}</ul>
<pre>${escapeHtml(group.text)}</pre>
</section>`;
  });
  const overviewItems = [...overview].map(
    ([name, { anchor, count }]) =>
      `<li><a href="#${anchor}">${escapeHtml(name)}</a> (${count})</li>`,
  );
  return page(
    "SocaDB Third-Party Licenses",
    `<h1>Third-party licenses</h1>
<p>SocaDB ${escapeHtml(version)} includes the software below. Each license text appears once, followed by the components it covers.</p>
<h2>Overview</h2>
<ul class="overview">${overviewItems.join("")}</ul>
<h2>Licenses</h2>
${sections.join("\n")}`,
  );
}

export function renderPlaceholder(): string {
  return page(
    "SocaDB Third-Party Licenses",
    `<h1>Third-party licenses</h1>
<p>Development builds don't list them: run <code>bun run build:all</code>, or see a release build.</p>`,
  );
}
