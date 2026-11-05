import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTERRUPT_GRACE_MS,
  stopTurn,
  type StoppableTurn,
} from "../../mcp-server/src/claude-stop";

function turnWith(interrupt = vi.fn(() => Promise.resolve())) {
  const turn: StoppableTurn = {
    controller: new AbortController(),
    query: { interrupt },
    stopped: false,
  };
  return { turn, interrupt };
}

describe("stopTurn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("interrupts the turn without killing the CLI", async () => {
    const { turn, interrupt } = turnWith();
    stopTurn(turn);
    await vi.advanceTimersByTimeAsync(INTERRUPT_GRACE_MS - 1);
    expect(turn.stopped).toBe(true);
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(turn.controller.signal.aborted).toBe(false);
  });

  it("aborts when the CLI doesn't react in time", async () => {
    const { turn } = turnWith(vi.fn(() => new Promise<void>(() => undefined)));
    stopTurn(turn);
    await vi.advanceTimersByTimeAsync(INTERRUPT_GRACE_MS);
    expect(turn.controller.signal.aborted).toBe(true);
  });

  it("leaves a turn alone once it has ended", async () => {
    const { turn } = turnWith(vi.fn(() => new Promise<void>(() => undefined)));
    stopTurn(turn);
    clearTimeout(turn.stopDeadline);
    await vi.advanceTimersByTimeAsync(INTERRUPT_GRACE_MS);
    expect(turn.controller.signal.aborted).toBe(false);
  });

  it("aborts at once when the interrupt is refused", async () => {
    const { turn } = turnWith(vi.fn(() => Promise.reject(new Error("closed"))));
    stopTurn(turn);
    await vi.advanceTimersByTimeAsync(0);
    expect(turn.controller.signal.aborted).toBe(true);
  });

  it("only acts once", async () => {
    const { turn, interrupt } = turnWith();
    stopTurn(turn);
    stopTurn(turn);
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it("still marks a turn whose CLI hasn't started", async () => {
    const turn: StoppableTurn = { controller: new AbortController(), stopped: false };
    stopTurn(turn);
    expect(turn.stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(INTERRUPT_GRACE_MS);
    expect(turn.controller.signal.aborted).toBe(true);
  });
});
