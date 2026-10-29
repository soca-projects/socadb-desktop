import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("./platform", () => ({ IS_MAC: true }));

import { invoke } from "@tauri-apps/api/core";
import { useSchemaStore } from "../stores/schemaStore";
import { initDocumentEdited } from "./documentEdited";

const table = (id: string) => ({ id, name: id, position: { x: 0, y: 0 }, columns: [] });

describe("unsaved dot in the close button", () => {
  it("follows unsaved changes and tells the window only when they change", () => {
    initDocumentEdited();
    expect(invoke).not.toHaveBeenCalled();

    useSchemaStore.getState().addTable(table("users"));
    useSchemaStore.getState().addTable(table("posts"));
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenLastCalledWith("set_document_edited", { edited: true });

    useSchemaStore.getState().markSaved();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith("set_document_edited", { edited: false });
  });
});
