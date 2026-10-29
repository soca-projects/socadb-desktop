import { create } from "zustand";
import {
  reportFullscreen,
  startExitingFullscreen,
  WINDOWED,
  type FullscreenState,
} from "../utils/windowButtons";

interface WindowState {
  fullscreen: FullscreenState;
  reportFullscreen: (fullscreen: boolean) => void;
  startExitingFullscreen: () => void;
}

export const useWindowStore = create<WindowState>()((set) => ({
  fullscreen: WINDOWED,
  reportFullscreen: (fullscreen) =>
    set((s) => ({ fullscreen: reportFullscreen(s.fullscreen, fullscreen) })),
  startExitingFullscreen: () =>
    set((s) => ({ fullscreen: startExitingFullscreen(s.fullscreen) })),
}));
