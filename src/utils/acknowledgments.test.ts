import { describe, it, expect } from "vitest";
import {
  chooseLicenses,
  groupAttributions,
  isLicenseFileName,
  isNoticeFileName,
  packageOfModule,
  pickLicenseFiles,
  renderAcknowledgments,
  sourceUrl,
  viteNotices,
  type Attribution,
  type Component,
} from "./acknowledgments";

const ACCEPTED = ["MIT", "Apache-2.0", "ISC", "Apache-2.0 WITH LLVM-exception"];

describe("chooseLicenses", () => {
  it("keeps a single accepted license", () => {
    expect(chooseLicenses("ISC", ACCEPTED)).toEqual(["ISC"]);
  });

  it("picks the alternative ranked first in the accepted list", () => {
    expect(chooseLicenses("Apache-2.0 OR MIT", ACCEPTED)).toEqual(["MIT"]);
    expect(chooseLicenses("(GPL-3.0-only OR ISC)", ACCEPTED)).toEqual(["ISC"]);
  });

  it("needs every license of an AND", () => {
    expect(chooseLicenses("MIT AND ISC", ACCEPTED)).toEqual(["MIT", "ISC"]);
    expect(chooseLicenses("MIT AND GPL-3.0-only", ACCEPTED)).toBeNull();
  });

  it("binds AND tighter than OR, and reads exceptions", () => {
    expect(chooseLicenses("GPL-3.0-only AND MIT OR ISC", ACCEPTED)).toEqual(["ISC"]);
    expect(chooseLicenses("Apache-2.0 WITH LLVM-exception", ACCEPTED)).toEqual([
      "Apache-2.0 WITH LLVM-exception",
    ]);
  });

  it("rejects what isn't SPDX", () => {
    expect(chooseLicenses("SEE LICENSE IN README.md", ACCEPTED)).toBeNull();
    expect(chooseLicenses("(MIT", ACCEPTED)).toBeNull();
    expect(chooseLicenses("", ACCEPTED)).toBeNull();
  });
});

describe("packageOfModule", () => {
  it("finds the innermost package of a module path", () => {
    expect(packageOfModule("/repo/node_modules/a/node_modules/zod/v4/index.js")).toEqual({
      dir: "/repo/node_modules/a/node_modules/zod",
      name: "zod",
    });
  });

  it("reads scoped names, Rollup's virtual prefix and query, and Windows paths", () => {
    expect(
      packageOfModule("\0/repo/node_modules/react/index.js?commonjs-module"),
    ).toEqual({
      dir: "/repo/node_modules/react",
      name: "react",
    });
    expect(packageOfModule("node_modules\\@xyflow\\react\\dist\\index.js")).toEqual({
      dir: "node_modules/@xyflow/react",
      name: "@xyflow/react",
    });
  });

  it("ignores our own modules and folders that only end in node_modules", () => {
    expect(packageOfModule("/repo/src/main.tsx")).toBeNull();
    expect(packageOfModule("/repo/my_node_modules/x/index.js")).toBeNull();
    expect(packageOfModule("\0vite/modulepreload-polyfill.js")).toBeNull();
  });
});

describe("license files", () => {
  it("recognizes license and notice files, not code or SPDX documents", () => {
    for (const file of [
      "LICENSE",
      "LICENSE.md",
      "license.txt",
      "LICENCE-MIT",
      "COPYING",
      "NOTICE",
    ]) {
      expect(isLicenseFileName(file)).toBe(true);
    }
    for (const file of ["LICENSE.spdx", "license.js", "README.md", "licenses.json"]) {
      expect(isLicenseFileName(file)).toBe(false);
    }
    expect(isNoticeFileName("NOTICE.txt")).toBe(true);
    expect(isNoticeFileName("LICENSE")).toBe(false);
  });

  it("keeps the files of the chosen license when a package ships several", () => {
    expect(pickLicenseFiles(["LICENSE-APACHE-2.0", "LICENSE-MIT"], ["MIT"])).toEqual([
      "LICENSE-MIT",
    ]);
    expect(pickLicenseFiles(["LICENSE"], ["MIT"])).toEqual(["LICENSE"]);
    expect(pickLicenseFiles(["COPYING", "LICENSE"], ["MIT"])).toEqual([
      "COPYING",
      "LICENSE",
    ]);
  });

  it("keeps every file when the package needs all of its licenses", () => {
    expect(pickLicenseFiles(["LICENSE", "LICENSE-MIT"], ["Apache-2.0", "MIT"])).toEqual([
      "LICENSE",
      "LICENSE-MIT",
    ]);
  });
});

describe("sourceUrl", () => {
  it("turns npm repository fields into web links", () => {
    expect(sourceUrl("git+https://github.com/colinhacks/zod.git")).toBe(
      "https://github.com/colinhacks/zod",
    );
    expect(sourceUrl({ type: "git", url: "git://github.com/a/b.git" })).toBe(
      "https://github.com/a/b",
    );
    expect(sourceUrl("git+ssh://git@github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(sourceUrl("ajv-validator/ajv")).toBe("https://github.com/ajv-validator/ajv");
    expect(sourceUrl("github:pugjs/void-elements")).toBe(
      "https://github.com/pugjs/void-elements",
    );
    expect(sourceUrl("https://github.com/tailwindlabs/tailwindcss.git#v3")).toBe(
      "https://github.com/tailwindlabs/tailwindcss#v3",
    );
  });

  it("drops what isn't a web link", () => {
    expect(sourceUrl("javascript:alert(1)")).toBeUndefined();
    expect(sourceUrl(undefined)).toBeUndefined();
    expect(sourceUrl({ type: "git" })).toBeUndefined();
  });
});

describe("viteNotices", () => {
  const licenseMd = [
    "# Vite core license",
    "Vite is released under the MIT license:",
    "",
    "MIT License",
    "Copyright (c) Vite",
    "",
    "# Licenses of bundled dependencies",
    "## @rollup/plugin-alias, @rollup/plugin-commonjs",
    "License: MIT",
    "By: Rich Harris",
    "",
    "> The MIT License (MIT)",
    ">",
    "> Copyright (c) RollupJS",
    "",
    "---------------------------------------",
    "",
    "## anymatch",
    "> ISC text",
  ].join("\n");

  it("keeps Vite's own license and the CommonJS helpers' one", () => {
    expect(viteNotices(licenseMd).map((notice) => notice.text.trim())).toEqual([
      "MIT License\nCopyright (c) Vite",
      "The MIT License (MIT)\n\nCopyright (c) RollupJS",
    ]);
  });

  it("fails when the file no longer has those sections", () => {
    expect(() => viteNotices("# Vite core license\nMIT\n")).toThrow(/viteNotices/);
  });
});

const npm = (name: string, version = "1.0.0"): Component => ({
  name,
  version,
  kind: "npm",
});
const mit = (holder: string) => ({
  name: "MIT License",
  text: `MIT License\n\nCopyright (c) ${holder}\n`,
});
const apache = {
  name: "Apache License 2.0",
  text: "Apache License\r\nVersion 2.0  \r\n",
};

describe("groupAttributions", () => {
  const attributions: Attribution[] = [
    { component: npm("zod"), notices: [mit("Colin")] },
    { component: { name: "serde", version: "1.0.0", kind: "crate" }, notices: [apache] },
    {
      component: npm("b"),
      notices: [{ ...apache, text: "Apache License\nVersion 2.0\n" }],
    },
    { component: npm("a"), notices: [apache] },
    { component: npm("zod"), notices: [mit("Colin")] },
    { component: npm("react"), notices: [mit("Meta")] },
  ];
  const groups = groupAttributions(attributions);

  it("shares one group per license text, whatever the line endings", () => {
    expect(
      groups.map((group) => [group.name, group.components.map((c) => c.name)]),
    ).toEqual([
      ["Apache License 2.0", ["a", "b", "serde"]],
      ["MIT License", ["react"]],
      ["MIT License", ["zod"]],
    ]);
    expect(groups[0].text).toBe("Apache License\nVersion 2.0");
  });

  it("lists a component once even when two bundles include it", () => {
    expect(
      groups.flatMap((group) => group.components).filter((c) => c.name === "zod"),
    ).toHaveLength(1);
  });
});

describe("renderAcknowledgments", () => {
  const html = renderAcknowledgments({
    version: "0.1.6",
    groups: [
      {
        name: "MIT License",
        text: "Copyright <script>",
        components: [{ ...npm("x"), url: 'https://example.com/"x' }, npm("y")],
      },
      { name: "MIT License", text: "Copyright B", components: [npm("z")] },
      {
        name: "ISC License",
        text: "ISC",
        components: [{ name: "Bun", version: "1.3.14", kind: "other" }],
      },
    ],
  });

  it("escapes license texts and links", () => {
    expect(html).toContain("<pre>Copyright &lt;script&gt;</pre>");
    expect(html).toContain('<a href="https://example.com/&quot;x">x 1.0.0</a>');
    expect(html).not.toContain("<script");
  });

  it("counts each license kind in the overview and links its first text", () => {
    expect(html).toContain('<li><a href="#license-1">MIT License</a> (3)</li>');
    expect(html).toContain('<li><a href="#license-3">ISC License</a> (1)</li>');
  });

  it("tags packages by ecosystem only", () => {
    expect(html).toContain('<li>y 1.0.0 <span class="kind">npm</span></li>');
    expect(html).toContain("<li>Bun 1.3.14</li>");
  });

  it("forbids scripts and remote loads", () => {
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
  });
});
