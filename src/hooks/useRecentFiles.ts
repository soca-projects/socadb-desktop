import { useSyncExternalStore } from "react";
import {
  areRecentFilesLoaded,
  getRecentFiles,
  subscribeRecentFiles,
} from "../utils/recentFiles";

export function useRecentFiles() {
  return useSyncExternalStore(subscribeRecentFiles, getRecentFiles);
}

export function useRecentFilesLoaded() {
  return useSyncExternalStore(subscribeRecentFiles, areRecentFilesLoaded);
}
