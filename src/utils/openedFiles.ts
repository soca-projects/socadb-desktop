import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { OpenedFilesZ } from "./zodSchemas";
import { handleOpenRecent, handleShowHome } from "./menuActions";
import { addRecentFile } from "./recentFiles";
import { logWarn } from "./log";

export function openFromSystem(paths: string[]) {
  const [first, ...rest] = paths;
  if (!first) return;
  const underDialog = document.querySelector('[role="dialog"]') !== null;
  if (rest.length === 0 && !underDialog) {
    handleOpenRecent(first);
    return;
  }
  for (const path of paths) addRecentFile(path);
  if (!underDialog) handleShowHome();
}

function receive(payload: unknown) {
  const parsed = OpenedFilesZ.safeParse(payload);
  if (parsed.success) openFromSystem(parsed.data);
  else logWarn("file.opened.invalid", parsed.error);
}

export async function startOpenedFiles(): Promise<() => void> {
  const unlisten = await listen("files-opened", (event) => receive(event.payload));
  receive(await invoke("take_opened_files"));
  return unlisten;
}
