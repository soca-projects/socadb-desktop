import { describe, it, expect, beforeEach, vi } from "vitest";

const env = vi.hoisted(() => ({ current: "0.1.5", language: "fr" }));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve(env.current)),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(() => Promise.resolve()) }));
vi.mock("../i18n", () => ({
  default: {
    get resolvedLanguage() {
      return env.language;
    },
  },
  isLanguage: (value: unknown) => value === "en" || value === "fr",
}));
vi.mock("./updater", () => ({ CHANGELOG_URL: "https://socadb.com/changelog" }));
vi.mock("./log", () => ({ logWarn: vi.fn() }));

import { openUrl } from "@tauri-apps/plugin-opener";
import { useReleaseNotesStore } from "../stores/releaseNotesStore";
import {
  changelogUrl,
  incomingReleases,
  prefetchIncomingNotes,
  showIncomingNotes,
} from "./incomingReleaseNotes";
import { logWarn } from "./log";

const CHANGELOG = `# Changelog

## [0.1.9] - 2026-12-10

### Interne

- Les dépendances sont à jour.

## [0.1.8] - 2026-12-01

La 0.1.8 corrige un bug.

## [0.1.7] - 2026-11-20

La 0.1.7 ajoute la palette.

### Ajouts

- Une palette de commandes.

## [0.1.6] - 2026-11-10

La 0.1.6 rend l'app plus native.

## [0.1.5] - 2026-10-20

La 0.1.5 enrichit les schémas.
`;

const fetchMock = vi.fn();

function serve(response: { ok: boolean; status?: number; text?: string }) {
  fetchMock.mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    text: () => Promise.resolve(response.text ?? ""),
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function shownVersions(): string[] | null {
  const modal = useReleaseNotesStore.getState().modal;
  return modal && "incoming" in modal ? modal.incoming.map((r) => r.version) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  useReleaseNotesStore.setState({ modal: null });
  env.current = "0.1.5";
  env.language = "fr";
});

describe("notes of the incoming update", () => {
  it("reads the changelog at the update's tag, in the app's language", () => {
    expect(changelogUrl("0.1.7", "fr")).toBe(
      "https://raw.githubusercontent.com/soca-projects/socadb-desktop/v0.1.7/CHANGELOG.fr.md",
    );
    expect(changelogUrl("0.1.7", "en")).toBe(
      "https://raw.githubusercontent.com/soca-projects/socadb-desktop/v0.1.7/CHANGELOG.md",
    );
  });

  it("opens the notes the toast downloaded, newest first", async () => {
    serve({ ok: true, text: CHANGELOG });
    prefetchIncomingNotes("0.1.7");
    await settle();
    await showIncomingNotes("0.1.7");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      changelogUrl("0.1.7", "fr"),
      expect.anything(),
    );
    expect(shownVersions()).toEqual(["0.1.7", "0.1.6"]);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("opens the website right away while the notes are still downloading", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    prefetchIncomingNotes("0.1.8");
    await settle();
    await showIncomingNotes("0.1.8");
    expect(openUrl).toHaveBeenCalledWith("https://socadb.com/changelog");
    expect(shownVersions()).toBeNull();
  });

  it("opens the website after a failed download, and downloads again for the next click", async () => {
    env.current = "0.1.4";
    fetchMock.mockRejectedValueOnce(new TypeError("Load failed"));
    serve({ ok: true, text: CHANGELOG });
    prefetchIncomingNotes("0.1.7");
    await settle();
    await showIncomingNotes("0.1.7");
    expect(openUrl).toHaveBeenCalledWith("https://socadb.com/changelog");
    expect(logWarn).toHaveBeenCalledWith(
      "updater.release_notes.fetch_failed",
      expect.any(TypeError),
      { version: "0.1.7" },
    );
    expect(shownVersions()).toBeNull();

    await settle();
    await showIncomingNotes("0.1.7");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(shownVersions()).toEqual(["0.1.7", "0.1.6", "0.1.5"]);
  });

  it("opens the website when the tag has no changelog", async () => {
    serve({ ok: false, status: 404 });
    prefetchIncomingNotes("0.1.6");
    await settle();
    await showIncomingNotes("0.1.6");
    expect(openUrl).toHaveBeenCalledWith("https://socadb.com/changelog");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("opens the website when the update only has developer notes", async () => {
    env.current = "0.1.8";
    serve({ ok: true, text: CHANGELOG });
    prefetchIncomingNotes("0.1.9");
    await settle();
    await showIncomingNotes("0.1.9");
    expect(shownVersions()).toBeNull();
    expect(openUrl).toHaveBeenCalledWith("https://socadb.com/changelog");
  });

  it("doesn't download anything for a release candidate", async () => {
    await expect(incomingReleases("0.1.5", "0.1.6-rc.2", "en")).resolves.toEqual([]);
    prefetchIncomingNotes("0.1.6-rc.2");
    await settle();
    await showIncomingNotes("0.1.6-rc.2");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith("https://socadb.com/changelog");
  });

  it("follows the app's language", async () => {
    env.language = "en";
    env.current = "0.1.6";
    serve({ ok: true, text: CHANGELOG });
    prefetchIncomingNotes("0.1.8");
    await settle();
    await showIncomingNotes("0.1.8");
    expect(fetchMock).toHaveBeenCalledWith(
      changelogUrl("0.1.8", "en"),
      expect.anything(),
    );
    expect(shownVersions()).toEqual(["0.1.8", "0.1.7"]);
  });
});
