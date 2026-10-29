import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { blockWebContextMenu } from "./contextMenu";

class FakeElement {
  constructor(private readonly inField = false) {}
  closest() {
    return this.inField ? this : null;
  }
}

const SELECTED_TEXT = { left: 100, top: 100, right: 200, bottom: 120 };
let selected = false;

beforeEach(() => {
  selected = false;
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("window", {
    getSelection: () => ({
      rangeCount: selected ? 1 : 0,
      getRangeAt: () => ({ getClientRects: () => [SELECTED_TEXT] }),
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rightClick(target: FakeElement, clientX = 0, clientY = 0) {
  const preventDefault = vi.fn();
  blockWebContextMenu({
    target: target as unknown as EventTarget,
    clientX,
    clientY,
    preventDefault,
  });
  return preventDefault.mock.calls.length === 0;
}

describe("right click", () => {
  it("keeps the web menu in a text field", () => {
    expect(rightClick(new FakeElement(true))).toBe(true);
  });

  it("keeps the web menu on selected text", () => {
    selected = true;
    expect(rightClick(new FakeElement(), 150, 110)).toBe(true);
  });

  it("blocks the web menu anywhere else", () => {
    expect(rightClick(new FakeElement(), 150, 110)).toBe(false);
  });

  it("blocks the web menu beside selected text, even inside the same message", () => {
    selected = true;
    expect(rightClick(new FakeElement(), 90, 110)).toBe(false);
    expect(rightClick(new FakeElement(), 150, 140)).toBe(false);
  });
});
