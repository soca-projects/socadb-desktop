import { useEffect } from "react";
import { startOpenedFiles } from "../utils/openedFiles";

export function useOpenedFiles(guardReady: boolean) {
  useEffect(() => {
    if (!guardReady) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void startOpenedFiles().then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [guardReady]);
}
