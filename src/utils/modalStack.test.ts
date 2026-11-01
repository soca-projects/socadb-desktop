import { describe, it, expect, vi } from "vitest";
import { enterModal, focusTopModal } from "./modalStack";

describe("modal stack", () => {
  it("lets only the last dialog opened react", () => {
    const settings = enterModal();
    const notes = enterModal();
    expect(notes.isTop()).toBe(true);
    expect(settings.isTop()).toBe(false);
    notes.leave();
    expect(settings.isTop()).toBe(true);
    settings.leave();
  });

  it("copes with dialogs closing out of order", () => {
    const about = enterModal();
    const notes = enterModal();
    about.leave();
    expect(notes.isTop()).toBe(true);
    notes.leave();
    notes.leave();
    const next = enterModal();
    expect(next.isTop()).toBe(true);
    next.leave();
  });

  it("hands the focus to the dialog left underneath", () => {
    const focusSettings = vi.fn();
    const settings = enterModal(focusSettings);
    const notes = enterModal(vi.fn());
    notes.leave();
    focusTopModal();
    expect(focusSettings).toHaveBeenCalledTimes(1);
    settings.leave();
    focusTopModal();
    expect(focusSettings).toHaveBeenCalledTimes(1);
  });
});
