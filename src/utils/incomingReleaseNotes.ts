import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import i18next, { isLanguage, type Language } from "../i18n";
import { useReleaseNotesStore } from "../stores/releaseNotesStore";
import { logWarn } from "./log";
import { parseChangelog, releasesBetween, type Release } from "./releaseNotes";
import { CHANGELOG_URL } from "./updater";

const RAW_REPOSITORY = "https://raw.githubusercontent.com/soca-projects/socadb-desktop";
const FETCH_TIMEOUT_MS = 5_000;
const STABLE_VERSION = /^\d+\.\d+\.\d+$/;

const requests = new Map<string, Promise<Release[]>>();
const downloaded = new Map<string, Release[]>();

export function changelogUrl(version: string, language: Language): string {
  const file = language === "fr" ? "CHANGELOG.fr.md" : "CHANGELOG.md";
  return `${RAW_REPOSITORY}/v${version}/${file}`;
}

function cacheKey(current: string, incoming: string, language: Language) {
  return `${current}>${incoming}:${language}`;
}

async function downloadChangelog(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export function incomingReleases(
  current: string,
  incoming: string,
  language: Language,
): Promise<Release[]> {
  if (!STABLE_VERSION.test(current) || !STABLE_VERSION.test(incoming)) {
    return Promise.resolve([]);
  }
  const key = cacheKey(current, incoming, language);
  const pending = requests.get(key);
  if (pending) return pending;
  const request = downloadChangelog(changelogUrl(incoming, language))
    .then((markdown) => {
      const releases = releasesBetween(parseChangelog(markdown), current, incoming);
      downloaded.set(key, releases);
      return releases;
    })
    .catch((error: unknown) => {
      requests.delete(key);
      logWarn("updater.release_notes.fetch_failed", error, { version: incoming });
      return [];
    });
  requests.set(key, request);
  return request;
}

function appLanguage(): Language {
  return isLanguage(i18next.resolvedLanguage) ? i18next.resolvedLanguage : "en";
}

export function prefetchIncomingNotes(incoming: string) {
  void getVersion().then((current) => incomingReleases(current, incoming, appLanguage()));
}

// The link never waits on the network: a request that hangs would leave it dead.
export async function showIncomingNotes(incoming: string) {
  const current = await getVersion();
  const language = appLanguage();
  const releases = downloaded.get(cacheKey(current, incoming, language));
  if (releases && releases.length > 0) {
    useReleaseNotesStore.getState().openIncomingNotes(releases);
    return;
  }
  void incomingReleases(current, incoming, language);
  await openUrl(CHANGELOG_URL);
}
