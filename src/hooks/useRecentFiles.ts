import { useSyncExternalStore } from "react";
import { getRecentFiles, subscribeRecentFiles } from "../utils/recentFiles";

export function useRecentFiles() {
  return useSyncExternalStore(subscribeRecentFiles, getRecentFiles);
}
