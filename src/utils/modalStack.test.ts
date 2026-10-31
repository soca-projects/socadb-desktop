import { describe, it, expect } from "vitest";
import { enterModal } from "./modalStack";

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
});
