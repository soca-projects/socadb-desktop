import { useEffect, useState } from "react";
import { useRecentFiles } from "./useRecentFiles";
import { loadHomeEntries } from "../utils/homeEntries";
import type { HomeEntry } from "../utils/homeList";

export function useHomeEntries(): HomeEntry[] | null {
  const recents = useRecentFiles();
  const [entries, setEntries] = useState<HomeEntry[] | null>(null);
  const [focusCount, setFocusCount] = useState(0);

  useEffect(() => {
    const onFocus = () => setFocusCount((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadHomeEntries(recents)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch((e: unknown) => {
        console.warn("[home] failed to load schemas:", e);
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [recents, focusCount]);

  return entries;
}
