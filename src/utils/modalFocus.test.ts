import { describe, it, expect } from "vitest";
import { takeFocus } from "./modalFocus";

function setup(stealsFirstFocus: boolean) {
  const page = { name: "page" };
  let active: unknown = page;
  let focusCalls = 0;
  const overlay = {
    focus() {
      focusCalls += 1;
      active = stealsFirstFocus && focusCalls === 1 ? page : overlay;
    },
    contains: (node: unknown) => node === overlay,
  };
  return {
    overlay: overlay as unknown as HTMLElement,
    active: () => active as Element | null,
    calls: () => focusCalls,
    isFocused: () => active === overlay,
  };
}

describe("modal focus", () => {
  it("keeps the focus when a toast hands it back to the page", () => {
    const modal = setup(true);
    takeFocus(modal.overlay, modal.active);
    expect(modal.isFocused()).toBe(true);
  });

  it("focuses once when nothing takes it away", () => {
    const modal = setup(false);
    takeFocus(modal.overlay, modal.active);
    expect(modal.isFocused()).toBe(true);
    expect(modal.calls()).toBe(1);
  });
});
