import { describe, it, expect } from "vitest";
import {
  reportFullscreen,
  showsWindowButtons,
  startExitingFullscreen,
  WINDOWED,
} from "./windowButtons";

describe("window buttons", () => {
  it("hide in full screen and show again once the window reports it left", () => {
    const fullscreen = reportFullscreen(WINDOWED, true);
    expect(showsWindowButtons(fullscreen)).toBe(false);
    expect(showsWindowButtons(reportFullscreen(fullscreen, false))).toBe(true);
  });

  it("show as soon as macOS starts leaving full screen", () => {
    const exiting = startExitingFullscreen(reportFullscreen(WINDOWED, true));
    expect(showsWindowButtons(exiting)).toBe(true);
  });

  it("stay shown while the window still reports full screen during the exit", () => {
    const exiting = startExitingFullscreen(reportFullscreen(WINDOWED, true));
    expect(showsWindowButtons(reportFullscreen(exiting, true))).toBe(true);
  });

  it("hide again when the window enters full screen after the exit", () => {
    const exiting = startExitingFullscreen(reportFullscreen(WINDOWED, true));
    const windowed = reportFullscreen(exiting, false);
    expect(showsWindowButtons(reportFullscreen(windowed, true))).toBe(false);
  });

  it("ignore an exit notice outside full screen", () => {
    const state = startExitingFullscreen(WINDOWED);
    expect(showsWindowButtons(reportFullscreen(state, true))).toBe(false);
  });
});
