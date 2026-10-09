import { describe, it, expect } from "vitest";
import { formatShortcut } from "./platform";

describe("formatShortcut", () => {
  it("uses the Mac symbols on macOS", () => {
    expect(formatShortcut(["Mod", "Shift", "F"], true)).toBe("⌘⇧F");
    expect(formatShortcut(["Mod", "N"], true)).toBe("⌘N");
  });

  it("spells out Ctrl elsewhere", () => {
    expect(formatShortcut(["Mod", "Shift", "F"], false)).toBe("Ctrl+Shift+F");
    expect(formatShortcut(["Mod", "O"], false)).toBe("Ctrl+O");
  });
});
