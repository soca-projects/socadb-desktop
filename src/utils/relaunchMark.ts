import { invoke } from "@tauri-apps/api/core";
import { logWarn } from "./log";

export async function markRelaunch() {
  try {
    await invoke("mark_relaunch");
  } catch (e) {
    logWarn("file.opened.relaunch_mark_failed", e);
  }
}

export async function clearRelaunchMark() {
  try {
    await invoke("clear_relaunch");
  } catch (e) {
    logWarn("file.opened.relaunch_mark_failed", e);
  }
}
