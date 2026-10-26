import { describe, expect, it } from "vitest";
import { frameBatch } from "./frameBatch";

describe("frameBatch", () => {
  const scheduler = () => {
    const runs: (() => void)[] = [];
    return { runs, schedule: (run: () => void) => runs.push(run) };
  };

  it("hands every item added before the next frame to a single flush", () => {
    const { runs, schedule } = scheduler();
    const add = frameBatch<string>(schedule);
    const flushed: string[][] = [];

    add("books", (items) => flushed.push(items));
    add("authors", (items) => flushed.push(items));
    add("loans", (items) => flushed.push(items));
    runs.forEach((run) => run());

    expect(runs).toHaveLength(1);
    expect(flushed).toEqual([["books", "authors", "loans"]]);
  });

  it("starts a new batch once the frame has run", () => {
    const { runs, schedule } = scheduler();
    const add = frameBatch<string>(schedule);
    const flushed: string[][] = [];

    add("books", (items) => flushed.push(items));
    runs[0]();
    add("authors", (items) => flushed.push(items));
    runs[1]();

    expect(flushed).toEqual([["books"], ["authors"]]);
  });
});
