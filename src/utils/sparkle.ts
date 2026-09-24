import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// Commands must also be allowed in src-tauri/capabilities/macos.json.
export const SPARKLE_EVENTS = {
  updateFound: "sparkle://did-find-valid-update",
  updateStaged: "sparkle://will-install-update-on-quit",
  cycleFinished: "sparkle://did-finish-update-cycle",
} as const;

const VersionPayloadZ = z.object({ version: z.string() });

const CycleFinishedPayloadZ = z.object({
  error: z
    .object({
      message: z.string(),
      noUpdate: z.object({}).nullish(),
    })
    .nullish(),
});

export type SparkleCycleError = NonNullable<
  z.infer<typeof CycleFinishedPayloadZ>["error"]
>;

export function parseVersionPayload(payload: unknown): string | null {
  const parsed = VersionPayloadZ.safeParse(payload);
  return parsed.success ? parsed.data.version : null;
}

export function parseCycleFinishedPayload(payload: unknown): SparkleCycleError | null {
  const parsed = CycleFinishedPayloadZ.safeParse(payload);
  return parsed.success ? (parsed.data.error ?? null) : null;
}

export async function sparklePendingVersion(): Promise<string | null> {
  const pending = await invoke<unknown>("plugin:sparkle-updater|pending_update");
  return pending === null ? null : parseVersionPayload(pending);
}

export function sparkleSessionInProgress(): Promise<boolean> {
  return invoke<boolean>("plugin:sparkle-updater|session_in_progress");
}

export async function sparkleCheckInBackground(): Promise<void> {
  await invoke("plugin:sparkle-updater|check_for_updates_in_background");
}

export function sparkleInstallPendingUpdate(): Promise<boolean> {
  return invoke<boolean>("plugin:sparkle-updater|install_pending_update");
}
