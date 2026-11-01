type Kind = "insert" | "delete" | "other";
type Side = "field" | "schema";

interface Step {
  value: string;
  caretAfter: number;
}

// One order for the field's typing and the schema's steps, as in a native
// window: ⌘Z takes back whichever came last.
export interface FieldHistory {
  steps: Step[];
  index: number;
  kind: Kind | null;
  done: Side[];
  undone: Side[];
}

export interface FieldEdit {
  value: string;
  inputType: string;
  caretAfter: number;
  continues: boolean;
}

export function startHistory(value: string, caret: number): FieldHistory {
  return {
    steps: [{ value, caretAfter: caret }],
    index: 0,
    kind: null,
    done: [],
    undone: [],
  };
}

// WebKit confirms a dead key or an IME word as insert, delete, insert.
const COMPOSITION = new Set([
  "insertCompositionText",
  "deleteCompositionText",
  "insertFromComposition",
  "deleteByComposition",
]);

function kindOf(inputType: string): Kind {
  if (COMPOSITION.has(inputType)) return "insert";
  if (inputType === "insertFromPaste" || inputType === "insertFromDrop") return "other";
  if (inputType === "deleteByCut" || inputType === "deleteByDrag") return "other";
  if (inputType.startsWith("insert")) return "insert";
  if (inputType.startsWith("delete")) return "delete";
  return "other";
}

export function isComposition(inputType: string): boolean {
  return COMPOSITION.has(inputType);
}

export function recordInput(history: FieldHistory, edit: FieldEdit): FieldHistory {
  const current = history.steps[history.index];
  if (!current || edit.value === current.value) return history;
  const kind = kindOf(edit.inputType);
  const steps = history.steps.slice(0, history.index + 1);
  if (kind !== "other" && kind === history.kind && edit.continues) {
    steps[history.index] = { ...current, value: edit.value, caretAfter: edit.caretAfter };
    return { ...history, steps, kind };
  }
  steps.push({ value: edit.value, caretAfter: edit.caretAfter });
  return {
    steps,
    index: steps.length - 1,
    kind,
    done: [...history.done, "field"],
    undone: [],
  };
}

export function recordSchemaChange(history: FieldHistory): FieldHistory {
  return {
    ...history,
    steps: history.steps.slice(0, history.index + 1),
    kind: null,
    done: [...history.done, "schema"],
    undone: [],
  };
}

// A value the field didn't get from the user (a draft cleared on send, a name
// the agent changed) starts a new history.
export function syncHistory(
  history: FieldHistory,
  value: string,
  caret: number,
): FieldHistory {
  return value === history.steps[history.index]?.value
    ? history
    : startHistory(value, caret);
}

export function rebaseHistory(
  history: FieldHistory,
  value: string,
  caret: number,
): FieldHistory {
  if (value === history.steps[history.index]?.value) return history;
  const steps = [...history.steps];
  steps[history.index] = { value, caretAfter: caret };
  return { ...history, steps };
}

type Outcome =
  | { side: "field"; history: FieldHistory; value: string; selection: [number, number] }
  | { side: "schema" | null; history: FieldHistory };

function cameBack(restored: string, undone: string): [number, number] {
  const shorter = Math.min(restored.length, undone.length);
  let start = 0;
  while (start < shorter && restored[start] === undone[start]) start++;
  let end = 0;
  while (
    end < shorter - start &&
    restored[restored.length - 1 - end] === undone[undone.length - 1 - end]
  ) {
    end++;
  }
  return [start, restored.length - end];
}

function sides(undo: boolean, from: Side[], to: Side[]) {
  return undo ? { done: from, undone: to } : { done: to, undone: from };
}

export function takeStep(
  history: FieldHistory,
  command: "undo" | "redo",
  schemaCan: boolean,
): Outcome {
  const undo = command === "undo";
  // A schema step out of reach here (under a dialog, past the undo limit) gives
  // way to the field's typing.
  const from = (undo ? history.done : history.undone).filter(
    (side) => schemaCan || side === "field",
  );
  const to = undo ? history.undone : history.done;
  const next = from.at(-1);
  if (next === "field") {
    const current = history.steps[history.index];
    const index = history.index + (undo ? -1 : 1);
    const target = history.steps[index];
    if (!current || !target) return { side: null, history };
    const moved: FieldHistory = {
      ...history,
      index,
      kind: null,
      ...sides(undo, from.slice(0, -1), [...to, "field"]),
    };
    // Typing a schema undo already took off the field would make a ⌘Z that
    // changes nothing.
    if (target.value === current.value) return takeStep(moved, command, schemaCan);
    return {
      side: "field",
      history: moved,
      value: target.value,
      // Undo selects the text it brings back, as WebKit's own undo does.
      selection: undo
        ? cameBack(target.value, current.value)
        : [target.caretAfter, target.caretAfter],
    };
  }
  if (!schemaCan)
    return { side: null, history: { ...history, ...sides(undo, from, to) } };
  const rest = next === "schema" ? from.slice(0, -1) : from;
  return {
    side: "schema",
    history: { ...history, kind: null, ...sides(undo, rest, [...to, "schema"]) },
  };
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

// A password field keeps no history, as in native apps: it would hold every
// prefix of the API key.
function asTextField(target: unknown): TextField | null {
  if (target instanceof HTMLTextAreaElement) return target;
  if (
    target instanceof HTMLInputElement &&
    (target.type === "text" || target.type === "search")
  ) {
    return target;
  }
  return null;
}

let session: { field: TextField; history: FieldHistory } | null = null;
let pendingContinues: boolean | null = null;
let composing = false;
let compositionJoins: boolean | null = null;

function caretOf(field: TextField): number {
  return field.selectionEnd ?? field.value.length;
}

// Typing joins the last step only from where it stopped, with nothing selected,
// as in a native field.
function joinsLastStep(field: TextField, history: FieldHistory): boolean {
  const start = field.selectionStart ?? field.value.length;
  return (
    start === field.selectionEnd && start === history.steps[history.index]?.caretAfter
  );
}

// React tracks the value it last set: the prototype's setter bypasses that
// tracking, so the input event below reaches onChange.
function restore(field: TextField, value: string, [start, end]: [number, number]) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(field),
    "value",
  )?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.setSelectionRange(start, end);
}

// WebKit and Chromium keep one undo stack for the whole page, so their undo can
// revert another field's typing. A field replays its own values instead, and
// tells the caller when the schema's turn has come.
export function stepInField(command: "undo" | "redo", schemaCan: boolean): Side | null {
  const field = asTextField(document.activeElement);
  if (!field) return schemaCan ? "schema" : null;
  if (composing) return null;
  const history =
    session?.field === field
      ? syncHistory(session.history, field.value, caretOf(field))
      : startHistory(field.value, caretOf(field));
  const outcome = takeStep(history, command, schemaCan);
  session = { field, history: outcome.history };
  if (outcome.side === "field") restore(field, outcome.value, outcome.selection);
  return outcome.side;
}

// A field whose draft follows the schema (a column's default) now shows the
// value the schema step brought: it takes the current step's place, so the
// field's own steps keep their order.
export function settleSchemaStep() {
  if (!session || session.field !== document.activeElement) return;
  const { field, history } = session;
  session = { field, history: rebaseHistory(history, field.value, caretOf(field)) };
}

export function noteSchemaChange() {
  if (session) session = { ...session, history: recordSchemaChange(session.history) };
}

export function initFieldUndo() {
  document.addEventListener("focusin", (e) => {
    const field = asTextField(e.target);
    if (field && session?.field !== field) {
      session = { field, history: startHistory(field.value, caretOf(field)) };
    }
  });
  // WebView2 blurs the focused field when the window loses the focus.
  document.addEventListener("focusout", (e) => {
    if (session?.field === e.target && document.hasFocus()) session = null;
  });
  document.addEventListener("compositionstart", () => {
    composing = true;
    compositionJoins = session ? joinsLastStep(session.field, session.history) : null;
  });
  document.addEventListener("compositionend", () => {
    composing = false;
    compositionJoins = null;
  });
  document.addEventListener(
    "beforeinput",
    (e) => {
      if (!session || session.field !== e.target) return;
      const { field } = session;
      const history = syncHistory(session.history, field.value, caretOf(field));
      const inputType = e instanceof InputEvent ? e.inputType : "";
      if (isComposition(inputType)) {
        pendingContinues = compositionJoins ?? true;
        compositionJoins = true;
      } else {
        pendingContinues = joinsLastStep(field, history);
      }
      session = { field, history };
    },
    true,
  );
  document.addEventListener("input", (e) => {
    if (!session || session.field !== e.target) return;
    const { field } = session;
    session = {
      field,
      history: recordInput(session.history, {
        value: field.value,
        inputType: e instanceof InputEvent ? e.inputType : "",
        caretAfter: caretOf(field),
        continues: pendingContinues ?? false,
      }),
    };
    pendingContinues = null;
  });
}
