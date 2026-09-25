import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  checkForUpdates,
  handleSparkleCycleFinished,
  handleSparkleUpdateFound,
  handleSparkleUpdateStaged,
} from "../utils/updater";
import {
  parseCycleFinishedPayload,
  parseVersionPayload,
  SPARKLE_EVENTS,
} from "../utils/sparkle";
import { IS_MAC } from "../utils/platform";

const POLL_INTERVAL_MS = 30 * 60 * 1000;

function listenSparkle() {
  return [
    listen(SPARKLE_EVENTS.updateFound, (event) => {
      const version = parseVersionPayload(event.payload);
      if (version) handleSparkleUpdateFound(version);
    }),
    listen(SPARKLE_EVENTS.updateStaged, (event) => {
      const version = parseVersionPayload(event.payload);
      if (version) handleSparkleUpdateStaged(version);
    }),
    listen(SPARKLE_EVENTS.cycleFinished, (event) => {
      handleSparkleCycleFinished(parseCycleFinishedPayload(event.payload));
    }),
  ];
}

export function useAutoUpdate() {
  const didStart = useRef(false);

  useEffect(() => {
    if (IS_MAC) {
      // Sparkle schedules later checks itself.
      const unlistens = listenSparkle();
      if (!didStart.current) {
        didStart.current = true;
        void Promise.all(unlistens).then(() => checkForUpdates({ userInitiated: false }));
      }
      return () => {
        for (const unlisten of unlistens) void unlisten.then((fn) => fn());
      };
    }

    if (!didStart.current) {
      didStart.current = true;
      void checkForUpdates({ userInitiated: false });
    }
    const interval = setInterval(() => {
      void checkForUpdates({ userInitiated: false });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
