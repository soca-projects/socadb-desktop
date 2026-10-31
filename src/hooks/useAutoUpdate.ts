import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  CHECK_INTERVAL_MS,
  handleSparkleCycleFinished,
  handleSparkleUpdateFound,
  handleSparkleUpdateStaged,
  runScheduledCheck,
  startUpdates,
} from "../utils/updater";
import {
  parseCycleFinishedPayload,
  parseVersionPayload,
  SPARKLE_EVENTS,
} from "../utils/sparkle";
import { IS_MAC } from "../utils/platform";

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
    const unlistens = IS_MAC ? listenSparkle() : [];
    if (!didStart.current) {
      didStart.current = true;
      void Promise.all(unlistens).then(() => startUpdates());
    }
    const interval = setInterval(() => {
      void runScheduledCheck();
    }, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      for (const unlisten of unlistens) void unlisten.then((fn) => fn());
    };
  }, []);
}
