import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { z } from "zod";
import i18next, { isLanguage } from "../i18n";
import { useReleaseNotesStore } from "../stores/releaseNotesStore";
import { queueConfigWrite, readConfigForUpdate, socadbConfigPath } from "./socadbDir";
import { logError } from "./log";
import {
  compareVersions,
  releasesBetween,
  releasesFor,
  type Release,
} from "./releaseNotes";

const ConfigZ = z.record(z.string(), z.unknown());
const VersionZ = z.string().regex(/^\d+\.\d+\.\d+$/);

export function whatsNewSince(
  last: string | null,
  current: string,
  releases: Release[],
): string | null {
  if (last === null || compareVersions(current, last) <= 0) return null;
  return releasesBetween(releases, last, current).length > 0 ? last : null;
}

async function readLastVersion(): Promise<string | null> {
  try {
    const config = ConfigZ.parse(
      JSON.parse(await readTextFile(await socadbConfigPath())),
    );
    const parsed = VersionZ.safeParse(config.lastVersion);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeLastVersion(version: string) {
  try {
    await queueConfigWrite(async () => {
      const path = await socadbConfigPath();
      const data = await readConfigForUpdate(path);
      data.lastVersion = version;
      await invoke("atomic_write", { path, content: JSON.stringify(data) });
    });
  } catch (err) {
    logError("settings.last_version.persist_failed", err);
  }
}

function appLanguage() {
  return isLanguage(i18next.resolvedLanguage) ? i18next.resolvedLanguage : "en";
}

export async function startWhatsNew() {
  const current = await getVersion();
  const last = await readLastVersion();
  if (last !== current) await writeLastVersion(current);
  const since = whatsNewSince(last, current, releasesFor(appLanguage()));
  if (since) useReleaseNotesStore.getState().showToast(since, current);
}
