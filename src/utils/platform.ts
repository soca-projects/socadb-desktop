// Vitest runs in a Node environment that doesn't define `navigator`. Guard
// the access so platform.ts can be imported from test files (notably from
// types/chat.test.ts via types/chat.ts) without crashing at module load.
const PLATFORM = typeof navigator !== "undefined" ? navigator.platform.toLowerCase() : "";

export const IS_MAC = PLATFORM.includes("mac");
export const IS_LINUX = PLATFORM.includes("linux");
export const IS_WINDOWS = PLATFORM.includes("win");
