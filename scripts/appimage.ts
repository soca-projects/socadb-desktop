import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import {
  commonLicenseName,
  commonLicensesIn,
  parsePackageList,
  type Attribution,
} from "../src/utils/acknowledgments";

export const APPIMAGE_PACKAGES = join(
  import.meta.dir,
  "../src-tauri/linux/appimage-packages.txt",
);

export function listedPackages(): string[] {
  return parsePackageList(readFileSync(APPIMAGE_PACKAGES, "utf-8"));
}

// linuxdeploy downloads the runtime's continuous build each time, so the check
// requires each marker in it: a new runtime fails the build until this list
// follows. Versions only where the runtime's build script pins them.
export const APPIMAGE_TOOLING: {
  name: string;
  version: string;
  source: string;
  license: string;
  url: string;
  marker?: string;
}[] = [
  {
    name: "AppRun (AppImageKit)",
    version: "",
    source: "https://github.com/AppImage/AppImageKit",
    license: "MIT",
    url: "https://raw.githubusercontent.com/AppImage/AppImageKit/939ff4d4c033caa0170d0cac643098b5b5664528/LICENSE",
  },
  {
    name: "linuxdeploy-plugin-gtk",
    version: "",
    source: "https://github.com/linuxdeploy/linuxdeploy-plugin-gtk",
    license: "MIT",
    url: "https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gtk/7a3fbc31a9e5075073ff8790f26effbac5f84453/LICENSE.txt",
  },
  {
    name: "AppImage type 2 runtime",
    version: "",
    source: "https://github.com/AppImage/type2-runtime",
    license: "MIT",
    url: "https://raw.githubusercontent.com/AppImage/type2-runtime/fedfad51acc2860b2916a1eef32ba4a500ff31ef/LICENSE",
  },
  {
    name: "libfuse (in the AppImage runtime)",
    version: "3.15.0",
    source: "https://github.com/libfuse/libfuse/tree/fuse-3.15.0",
    license: "LGPL-2.1",
    url: "https://raw.githubusercontent.com/libfuse/libfuse/fuse-3.15.0/LGPL2.txt",
    marker: "3.15.0",
  },
  {
    name: "squashfuse (in the AppImage runtime)",
    version: "0.5.2",
    source: "https://github.com/vasi/squashfuse/tree/0.5.2",
    license: "BSD-2-Clause",
    url: "https://raw.githubusercontent.com/vasi/squashfuse/0.5.2/LICENSE",
    marker: "squashfuse 0.5.2",
  },
  {
    name: "zstd (in the AppImage runtime)",
    version: "1.5.6",
    source: "https://github.com/facebook/zstd/tree/v1.5.6",
    license: "BSD-3-Clause",
    url: "https://raw.githubusercontent.com/facebook/zstd/v1.5.6/LICENSE",
    marker: "1.5.6",
  },
  {
    name: "zlib (in the AppImage runtime)",
    version: "1.3.2",
    source: "https://github.com/madler/zlib/tree/v1.3.2",
    license: "Zlib",
    url: "https://raw.githubusercontent.com/madler/zlib/v1.3.2/LICENSE",
    marker: "inflate 1.3.2",
  },
  {
    name: "musl (in the AppImage runtime)",
    version: "",
    source: "https://musl.libc.org",
    license: "MIT",
    url: "https://git.musl-libc.org/cgit/musl/plain/COPYRIGHT?h=v1.2.5",
  },
  {
    name: "mimalloc (in the AppImage runtime)",
    version: "",
    source: "https://github.com/microsoft/mimalloc",
    license: "MIT",
    url: "https://raw.githubusercontent.com/microsoft/mimalloc/v2.1.7/LICENSE",
  },
];

// linuxdeploy copies the build machine's own libraries, so their copyright
// files and versions are read from the same machine.
export function ubuntuPackageAttributions(problems: string[]): Attribution[] {
  const packages = listedPackages();
  const query = spawnSync(
    "dpkg-query",
    [
      "-W",
      "-f=${Package}\t${Version}\t${source:Package}\t${source:Version}\n",
      ...packages,
    ],
    { encoding: "utf-8" },
  );
  if (query.error) throw new Error(`dpkg-query: ${query.error.message}`);
  const installed = new Map(
    query.stdout
      .trim()
      .split("\n")
      .map((line): [string, Record<"version" | "source" | "sourceVersion", string>] => {
        const [pkg, version, source, sourceVersion] = line.split("\t");
        return [pkg, { version, source, sourceVersion }];
      }),
  );
  const attributions: Attribution[] = [];
  for (const pkg of packages) {
    const row = installed.get(pkg);
    if (!row) {
      console.warn(
        `Warning: ${pkg} is listed but not installed here, so not bundled either`,
      );
      continue;
    }
    let copyright: string;
    try {
      copyright = readFileSync(`/usr/share/doc/${pkg}/copyright`, "utf-8");
    } catch {
      problems.push(`${pkg}: /usr/share/doc/${pkg}/copyright is missing`);
      continue;
    }
    const common = commonLicensesIn(copyright).flatMap((name) => {
      // Pango's copyright file says GPL-2.0 for the file named GPL-2.
      const path = [name, name.replace(/\.0$/, "")]
        .map((candidate) => join("/usr/share/common-licenses", candidate))
        .find((candidate) => existsSync(candidate));
      if (!path) {
        problems.push(
          `${pkg}: its copyright file points to a missing common license, ${name}`,
        );
        return [];
      }
      const file = realpathSync(path);
      return [
        { name: commonLicenseName(basename(file)), text: readFileSync(file, "utf-8") },
      ];
    });
    attributions.push({
      component: {
        name: pkg,
        version: row.version,
        kind: "appimage",
        url: `https://launchpad.net/ubuntu/+source/${row.source}/${row.sourceVersion}`,
      },
      notices: [{ name: "Ubuntu copyright file", text: copyright }, ...common],
    });
  }
  return attributions;
}
