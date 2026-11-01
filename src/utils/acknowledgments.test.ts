import { describe, it, expect } from "vitest";
import {
  checkBundledPackages,
  chooseLicenses,
  commonLicensesIn,
  groupAttributions,
  isLicenseFileName,
  isNoticeFileName,
  dpkgOwners,
  dpkgPattern,
  elfSize,
  packageOfModule,
  parsePackageList,
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

describe("AppImage packages", () => {
  it("reads the package list, skipping comments and blank lines", () => {
    expect(parsePackageList("# header\nlibgtk-3-0\n\n  libsoup-3.0-0  \n")).toEqual([
      "libgtk-3-0",
      "libsoup-3.0-0",
    ]);
  });

  it("finds the common licenses a copyright file points to", () => {
    const copyright = [
      "On Debian systems, the full text is in /usr/share/common-licenses/LGPL-2.1.",
      "See /usr/share/common-licenses/GPL-2 and `/usr/share/common-licenses/LGPL-2.1'",
      "(/usr/share/common-licenses/Apache-2.0)",
    ].join("\n");
    expect(commonLicensesIn(copyright)).toEqual(["LGPL-2.1", "GPL-2", "Apache-2.0"]);
  });

  it("reads which packages dpkg says own each path", () => {
    const search = [
      "libglib2.0-0:amd64: /usr/lib/x86_64-linux-gnu/libgio-2.0.so.0",
      "libglib2.0-dev:amd64, libglib2.0-dev-bin: /usr/lib/x86_64-linux-gnu/libgio-2.0.so",
      "diversion by foo from: /usr/lib/x",
      "local diversion from: /usr/lib/y",
    ].join("\n");
    const owners = dpkgOwners(search);
    expect(owners.get("/usr/lib/x86_64-linux-gnu/libgio-2.0.so.0")).toEqual([
      "libglib2.0-0",
    ]);
    expect(owners.get("/usr/lib/x86_64-linux-gnu/libgio-2.0.so")).toEqual([
      "libglib2.0-dev",
      "libglib2.0-dev-bin",
    ]);
    expect(owners.size).toBe(2);
  });

  const owners = new Map([
    ["/usr/lib/x86_64-linux-gnu/libgtk-3.so.0", ["libgtk-3-0"]],
    ["/usr/lib/x86_64-linux-gnu/libnew.so.1", ["libnew1"]],
    ["/usr/share/glib-2.0/schemas/org.gtk.Settings.gschema.xml", ["libgtk-3-common"]],
    ["/usr/share/other/org.gtk.Settings.gschema.xml", ["someone-else"]],
    ["/usr/share/elsewhere/only-there.xml", ["libgtk-3-common"]],
  ]);

  it("matches libraries by name and shared files by their exact path", () => {
    expect(dpkgPattern("usr/lib/libgtk-3.so.0")).toBe("*/libgtk-3.so.0");
    expect(dpkgPattern("usr/share/glib-2.0/schemas/a.xml")).toBe(
      "/usr/share/glib-2.0/schemas/a.xml",
    );
    expect(dpkgPattern("usr/lib/lib[x]*?.so")).toBe("*/lib\\[x\\]\\*\\?.so");
    expect(
      checkBundledPackages(
        [
          "usr/lib/libgtk-3.so.0",
          "usr/share/glib-2.0/schemas/org.gtk.Settings.gschema.xml",
        ],
        owners,
        ["libgtk-3-0", "libgtk-3-common"],
      ),
    ).toEqual({ unowned: [], missing: [], unused: [] });
    expect(
      checkBundledPackages(["usr/share/glib-2.0/schemas/only-there.xml"], owners, [
        "libgtk-3-common",
      ]).unowned,
    ).toEqual(["usr/share/glib-2.0/schemas/only-there.xml"]);
  });

  it("reports files no listed package covers, and listed packages left unused", () => {
    expect(
      checkBundledPackages(
        ["usr/lib/libgtk-3.so.0", "usr/lib/libnew.so.1", "usr/lib/libmystery.so"],
        owners,
        ["libgtk-3-0", "libold0"],
      ),
    ).toEqual({
      unowned: ["usr/lib/libmystery.so"],
      missing: [{ pkg: "libnew1", file: "usr/lib/libnew.so.1" }],
      unused: ["libold0"],
    });
  });
});

describe("elfSize", () => {
  it("reads where the section headers end, which is where an AppImage's payload starts", () => {
    const header = new Uint8Array(64);
    const view = new DataView(header.buffer);
    view.setBigUint64(0x28, 943_000n, true);
    view.setUint16(0x3a, 64, true);
    view.setUint16(0x3c, 25, true);
    expect(elfSize(header)).toBe(943_000 + 64 * 25);
  });
});
