export interface FullscreenState {
  fullscreen: boolean;
  exiting: boolean;
}

export const WINDOWED: FullscreenState = { fullscreen: false, exiting: false };

// The window buttons come back as soon as macOS starts leaving full screen, but
// the window reports full screen until the animation ends.
export function reportFullscreen(
  state: FullscreenState,
  fullscreen: boolean,
): FullscreenState {
  if (!fullscreen) return WINDOWED;
  return state.exiting ? state : { fullscreen: true, exiting: false };
}

export function startExitingFullscreen(state: FullscreenState): FullscreenState {
  return state.fullscreen ? { fullscreen: true, exiting: true } : state;
}

export function showsWindowButtons(state: FullscreenState): boolean {
  return !state.fullscreen || state.exiting;
}
