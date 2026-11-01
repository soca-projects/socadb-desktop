import { describe, it, expect } from "vitest";
import { arrowTarget } from "./arrowKeys";

describe("arrowTarget", () => {
  it("moves to the next and previous item, wrapping at both ends", () => {
    expect(arrowTarget("ArrowDown", 0, 3, "vertical")).toBe(1);
    expect(arrowTarget("ArrowDown", 2, 3, "vertical")).toBe(0);
    expect(arrowTarget("ArrowUp", 0, 3, "vertical")).toBe(2);
  });

  it("jumps to the first and last item", () => {
    expect(arrowTarget("Home", 2, 3, "both")).toBe(0);
    expect(arrowTarget("End", 0, 3, "both")).toBe(2);
  });

  it("takes left and right only on a horizontal control", () => {
    expect(arrowTarget("ArrowRight", 0, 3, "both")).toBe(1);
    expect(arrowTarget("ArrowLeft", 0, 3, "both")).toBe(2);
    expect(arrowTarget("ArrowRight", 0, 3, "vertical")).toBeNull();
  });

  it("ignores other keys and empty lists", () => {
    expect(arrowTarget("Enter", 0, 3, "both")).toBeNull();
    expect(arrowTarget("ArrowDown", 0, 0, "vertical")).toBeNull();
  });
});
