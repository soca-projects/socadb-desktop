const PLATFORM = navigator.platform.toLowerCase();

export const IS_MAC = PLATFORM.includes("mac");
export const IS_LINUX = PLATFORM.includes("linux");
export const IS_WINDOWS = PLATFORM.includes("win");
