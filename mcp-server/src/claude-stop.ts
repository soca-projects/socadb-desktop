import { errorText } from "./agent-runner-shared.ts";

export const INTERRUPT_GRACE_MS = 3000;

export interface StoppableTurn {
  controller: AbortController;
  query?: { interrupt: () => Promise<unknown> };
  stopped: boolean;
  stopDeadline?: ReturnType<typeof setTimeout>;
}

// Not abort() first: the SDK then leaves the CLI running for 2 s, 7 s on Windows,
// and killing it loses the reply so far, so a resume finds a turn with no answer.
// Abort is only the way out if the CLI doesn't react.
export function stopTurn(turn: StoppableTurn, graceMs = INTERRUPT_GRACE_MS) {
  if (turn.stopped) return;
  turn.stopped = true;
  const giveUp = (reason: string) => {
    console.error(`[agent] aborting a stopped turn: ${reason}`);
    turn.controller.abort();
  };
  turn.stopDeadline = setTimeout(() => giveUp("no reaction from the CLI"), graceMs);
  void turn.query?.interrupt().catch((error: unknown) => giveUp(errorText(error)));
}
