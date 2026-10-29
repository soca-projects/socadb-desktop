import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(() => Promise.resolve()) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
vi.mock("../stores/themeStore", () => ({ useThemeStore: { getState: vi.fn() } }));

import { createEmptySchema, useSchemaStore } from "../stores/schemaStore";
import { useViewStore } from "../stores/viewStore";
import { MENU_SHORTCUTS } from "./menuActions";

class FakeField {
  blur = vi.fn();
}

let openDialog: object | null = null;
let field: FakeField;

beforeEach(() => {
  openDialog = null;
  field = new FakeField();
  useViewStore.setState({ settingsOpen: false });
  vi.stubGlobal("HTMLElement", FakeField);
  vi.stubGlobal("document", {
    querySelector: () => openDialog,
    get activeElement() {
      return field;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings shortcut", () => {
  it("opens the settings", async () => {
    await MENU_SHORTCUTS.settings.run();
    expect(useViewStore.getState().settingsOpen).toBe(true);
  });

  it("takes the focus away from the field being edited", async () => {
    await MENU_SHORTCUTS.settings.run();
    expect(field.blur).toHaveBeenCalledOnce();
  });

  it("does nothing while another dialog is open", async () => {
    openDialog = {};
    await MENU_SHORTCUTS.settings.run();
    expect(useViewStore.getState().settingsOpen).toBe(false);
    expect(field.blur).not.toHaveBeenCalled();
  });

  it("matches Ctrl+, in the Windows fallback", () => {
    expect(MENU_SHORTCUTS.settings.windowsSignature).toBe("ctrl+,");
  });
});

class FakeInput extends FakeField {
  value = "";
}

describe("undo shortcut", () => {
  beforeEach(() => {
    useViewStore.setState({ view: "editor" });
    useSchemaStore.getState().setSchema(createEmptySchema());
    useSchemaStore.temporal.getState().clear();
    useSchemaStore
      .getState()
      .addTable({ id: "t1", name: "users", position: { x: 0, y: 0 }, columns: [] });
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLTextAreaElement", FakeInput);
  });

  function focus(element: object, dialog: object | null = null) {
    vi.stubGlobal("document", {
      activeElement: element,
      querySelector: () => dialog,
    });
  }

  it("undoes the agent's change while the chat box keeps the focus", async () => {
    focus(new FakeInput());
    await MENU_SHORTCUTS.undo.run();
    expect(useSchemaStore.getState().schema.tables).toHaveLength(0);
  });

  it("undoes the last schema change anywhere else", async () => {
    focus(new FakeField());
    await MENU_SHORTCUTS.undo.run();
    expect(useSchemaStore.getState().schema.tables).toHaveLength(0);
  });

  it("leaves the schema alone under an open dialog", async () => {
    focus(new FakeField(), {});
    await MENU_SHORTCUTS.undo.run();
    expect(useSchemaStore.getState().schema.tables).toHaveLength(1);
  });
});
