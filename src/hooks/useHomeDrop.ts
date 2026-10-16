import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { dropHint, importDropped } from "../utils/homeImport";
import { logError } from "../utils/log";

export function useHomeDrop(): "accept" | "reject" | null {
  const [hover, setHover] = useState<"accept" | "reject" | null>(null);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "enter") setHover(dropHint(payload.paths));
      else if (payload.type === "leave") setHover(null);
      else if (payload.type === "drop") {
        setHover(null);
        void importDropped(payload.paths);
      }
    });
    return () => {
      unlisten.then((fn) => fn()).catch((e: unknown) => logError("import.failed", e));
    };
  }, []);

  return hover;
}
