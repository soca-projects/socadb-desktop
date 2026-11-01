import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));

import { parseChangelog } from "./releaseNotes";
import { whatsNewSince } from "./whatsNew";

const CHANGELOG = [
  "## [0.1.5] - 2026-10-20",
  "",
  "### Added",
  "",
  "- Five.",
  "",
  "## [0.1.4] - 2026-10-12",
  "",
  "### Added",
  "",
  "- Four.",
  "",
  "## [0.1.3] - 2026-09-25",
  "",
  "### Fixed",
  "",
  "- Three.",
].join("\n");

const releases = parseChangelog(CHANGELOG);

describe("what's new at launch", () => {
  it("stays quiet on a first install, the same version or a downgrade", () => {
    expect(whatsNewSince(null, "0.1.5", releases)).toBeNull();
    expect(whatsNewSince("0.1.5", "0.1.5", releases)).toBeNull();
    expect(whatsNewSince("0.1.5", "0.1.4", releases)).toBeNull();
  });

  it("offers the notes after an update, skipped versions included", () => {
    expect(whatsNewSince("0.1.4", "0.1.5", releases)).toBe("0.1.4");
    expect(whatsNewSince("0.1.3", "0.1.5", releases)).toBe("0.1.3");
  });

  it("stays quiet on a version without notes, like a release candidate", () => {
    expect(whatsNewSince("0.1.5", "0.1.6", releases)).toBeNull();
  });

  it("stays quiet on a version with only developer notes", () => {
    const internalOnly = parseChangelog(
      `## [0.1.6] - 2026-11-10\n\n### Internal\n\n- Dependencies are updated.\n\n${CHANGELOG}`,
    );
    expect(whatsNewSince("0.1.5", "0.1.6", internalOnly)).toBeNull();
  });
});
