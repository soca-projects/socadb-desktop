import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import {
  initFieldUndo,
  noteSchemaChange,
  settleSchemaStep,
  stepInField,
} from "./fieldUndo";

const listeners = new Map<string, (e: unknown) => void>();
let focused: unknown = null;
let windowFocused = true;

class FakeInput {
  type = "text";
  selectionStart = 0;
  selectionEnd = 0;
  #value = "";
  get value() {
    return this.#value;
  }
  set value(value: string) {
    this.#value = value;
    this.selectionStart = this.selectionEnd = value.length;
  }
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  dispatchEvent(event: unknown) {
    listeners.get("input")?.(event);
    return true;
  }
}
class FakeTextArea extends FakeInput {}
class FakeInputEvent {
  constructor(
    readonly target: FakeInput,
    readonly inputType: string,
  ) {}
}

beforeEach(() => {
  listeners.clear();
  focused = null;
  windowFocused = true;
  vi.stubGlobal("HTMLInputElement", FakeInput);
  vi.stubGlobal("HTMLTextAreaElement", FakeTextArea);
  vi.stubGlobal("InputEvent", FakeInputEvent);
  vi.stubGlobal("document", {
    get activeElement() {
      return focused;
    },
    hasFocus: () => windowFocused,
    addEventListener: (type: string, listener: (e: unknown) => void) =>
      listeners.set(type, listener),
  });
  initFieldUndo();
  listeners.get("compositionend")?.({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function field(value = "", Kind = FakeInput) {
  const f = new Kind();
  f.value = value;
  return f;
}

function focus(f: FakeInput) {
  focused = f;
  listeners.get("focusin")?.({ target: f });
}

function edit(
  f: FakeInput,
  value: string,
  inputType = "insertText",
  caret = value.length,
) {
  listeners.get("beforeinput")?.(new FakeInputEvent(f, inputType));
  f.value = value;
  f.setSelectionRange(caret, caret);
  listeners.get("input")?.(new FakeInputEvent(f, inputType));
}

const undo = (schemaCan = true) => stepInField("undo", schemaCan);
const redo = (schemaCan = true) => stepInField("redo", schemaCan);

describe("⌘Z in a text field", () => {
  it("goes to the schema while nothing was typed in the field", () => {
    focus(field());
    expect(undo()).toBe("schema");
  });

  it("takes back one run of typing or deleting at a time, then the schema", () => {
    const name = field("user");
    focus(name);
    edit(name, "users");
    edit(name, "usersx");
    edit(name, "users", "deleteContentBackward");
    expect(undo()).toBe("field");
    expect(name.value).toBe("usersx");
    expect(undo()).toBe("field");
    expect(name.value).toBe("user");
    expect(undo()).toBe("schema");
  });

  it("selects the text an undo brings back", () => {
    const text = field("select * from users");
    focus(text);
    text.setSelectionRange(8, 8);
    edit(text, "select  from users", "deleteContentBackward", 7);
    undo();
    expect(text.value).toBe("select * from users");
    expect([text.selectionStart, text.selectionEnd]).toEqual([7, 8]);
  });

  it("selects the whole text again after typing over it", () => {
    const chat = field("hello world", FakeTextArea);
    focus(chat);
    chat.setSelectionRange(0, 11);
    edit(chat, "x");
    undo();
    expect(chat.value).toBe("hello world");
    expect([chat.selectionStart, chat.selectionEnd]).toEqual([0, 11]);
  });

  it("leaves the caret where undone typing started", () => {
    const chat = field("hello", FakeTextArea);
    focus(chat);
    edit(chat, "hello you");
    undo();
    expect([chat.selectionStart, chat.selectionEnd]).toEqual([5, 5]);
  });

  it("never reverts typing from before the code changed the value", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "add a posts table");
    chat.value = "";
    edit(chat, "x");
    expect(undo()).toBe("field");
    expect(chat.value).toBe("");
    expect(undo()).toBe("schema");
  });

  it("goes to the schema after the code changed the value", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "add a posts table");
    chat.value = "";
    expect(undo()).toBe("schema");
  });

  it("redoes what the field undid, then the schema", () => {
    const name = field();
    focus(name);
    edit(name, "id");
    undo();
    expect(redo()).toBe("field");
    expect(name.value).toBe("id");
    expect([name.selectionStart, name.selectionEnd]).toEqual([2, 2]);
    expect(redo()).toBe("schema");
  });

  it("redoes the schema first when the schema was undone last", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "hello");
    expect(undo()).toBe("field");
    expect(undo()).toBe("schema");
    expect(redo()).toBe("schema");
    expect(redo()).toBe("field");
    expect(chat.value).toBe("hello");
  });

  it("undoes a schema change made from the field before the typing behind it", () => {
    const fallback = field();
    focus(fallback);
    edit(fallback, "now()");
    noteSchemaChange();
    expect(undo()).toBe("schema");
    expect(fallback.value).toBe("now()");
    expect(undo()).toBe("field");
    expect(fallback.value).toBe("");
  });

  it("takes typing and schema changes back in the order they happened", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "ab");
    noteSchemaChange();
    edit(chat, "abc");
    expect(undo()).toBe("field");
    expect(chat.value).toBe("ab");
    expect(undo()).toBe("schema");
    expect(undo()).toBe("field");
    expect(chat.value).toBe("");
  });

  it("undoes a schema redo before the typing", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "abc");
    expect(redo()).toBe("schema");
    expect(undo()).toBe("schema");
    expect(undo()).toBe("field");
  });

  it("lets the typing through when the schema can't step", () => {
    const name = field();
    focus(name);
    edit(name, "orders");
    noteSchemaChange();
    expect(undo(false)).toBe("field");
    expect(name.value).toBe("");
    expect(undo(false)).toBeNull();
  });

  it("brings back typing hidden by a schema undo once the schema redo is done", () => {
    const fallback = field("now()");
    focus(fallback);
    edit(fallback, "now()::date");
    expect(undo()).toBe("field");
    expect(undo()).toBe("schema");
    fallback.value = "";
    settleSchemaStep();
    expect(redo()).toBe("schema");
    fallback.value = "now()";
    settleSchemaStep();
    expect(redo()).toBe("field");
    expect(fallback.value).toBe("now()::date");
  });

  it("skips typing a schema undo already took off the field", () => {
    const fallback = field();
    focus(fallback);
    edit(fallback, "now()");
    noteSchemaChange();
    expect(undo()).toBe("schema");
    fallback.value = "";
    settleSchemaStep();
    expect(undo()).toBe("schema");
  });

  it("never brings back a message sent after a schema undo", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "fix the");
    edit(chat, "fix th", "deleteContentBackward");
    noteSchemaChange();
    expect(undo()).toBe("schema");
    settleSchemaStep();
    chat.value = "";
    expect(undo()).toBe("schema");
    expect(chat.value).toBe("");
  });

  it("hears each new step of the schema store", () => {
    useSchemaStore.getState().setSchema(createEmptySchema());
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "hello");
    useSchemaStore
      .getState()
      .addTable({ id: "t1", name: "users", position: { x: 0, y: 0 }, columns: [] });
    expect(undo()).toBe("schema");
    useSchemaStore.temporal.getState().undo();
    expect(undo()).toBe("field");
  });

  it("drops the field's redo once the user types again", () => {
    const name = field();
    focus(name);
    edit(name, "id");
    undo();
    edit(name, "x");
    expect(redo()).toBe("schema");
  });

  it("starts a new step after the caret moved or a selection was replaced", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "hello world");
    chat.setSelectionRange(0, 11);
    edit(chat, "x");
    expect(undo()).toBe("field");
    expect(chat.value).toBe("hello world");
    chat.setSelectionRange(0, 0);
    edit(chat, "Xhello world", "insertText", 1);
    expect(undo()).toBe("field");
    expect(chat.value).toBe("hello world");
  });

  it("treats a dead-key accent as part of the typing", () => {
    const name = field("fen");
    focus(name);
    edit(name, "fene");
    listeners.get("compositionstart")?.({});
    edit(name, "fene^", "insertCompositionText");
    edit(name, "fene", "deleteCompositionText");
    edit(name, "feneê", "insertFromComposition");
    listeners.get("compositionend")?.({});
    edit(name, "feneêt");
    expect(undo()).toBe("field");
    expect(name.value).toBe("fen");
    expect(undo()).toBe("schema");
  });

  it("ignores ⌘Z while an accent is still being typed", () => {
    const name = field("fen");
    focus(name);
    listeners.get("compositionstart")?.({});
    edit(name, "fen^", "insertCompositionText");
    expect(undo()).toBeNull();
    expect(name.value).toBe("fen^");
  });

  it("leaves no step for an input the field rejected", () => {
    const size = field("12");
    focus(size);
    edit(size, "12");
    expect(undo()).toBe("schema");
  });

  it("keeps no history in a password field", () => {
    const key = field();
    key.type = "password";
    focus(key);
    edit(key, "sk-ant-123");
    expect(undo()).toBe("schema");
    expect(key.value).toBe("sk-ant-123");
  });

  it("keeps the history when the window loses the focus", () => {
    const chat = field("", FakeTextArea);
    focus(chat);
    edit(chat, "hello");
    windowFocused = false;
    listeners.get("focusout")?.({ target: chat });
    windowFocused = true;
    focus(chat);
    expect(undo()).toBe("field");
    expect(chat.value).toBe("");
  });

  it("starts over in another field", () => {
    const first = field();
    const second = field();
    focus(first);
    edit(first, "users");
    listeners.get("focusout")?.({ target: first });
    focus(second);
    expect(undo()).toBe("schema");
    expect(first.value).toBe("users");
  });
});
