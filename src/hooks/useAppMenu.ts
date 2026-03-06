import { useEffect } from "react";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { useSchemaStore, createEmptySchema } from "../stores/schemaStore";
import {
  openSchemaFile,
  saveSchemaFile,
  saveSchemaFileAs,
} from "../utils/fileOperations";
import { exportCanvasPng } from "../utils/exportPng";

async function handleSave() {
  const { schema, filePath, setFilePath } = useSchemaStore.getState();
  if (filePath) {
    await saveSchemaFile(schema, filePath);
  } else {
    const path = await saveSchemaFileAs(schema);
    if (path) setFilePath(path);
  }
}

async function handleSaveAs() {
  const { schema, setFilePath } = useSchemaStore.getState();
  const path = await saveSchemaFileAs(schema);
  if (path) setFilePath(path);
}

async function handleOpen() {
  const { setSchema, setFilePath } = useSchemaStore.getState();
  const result = await openSchemaFile();
  if (result) {
    setSchema(result.schema);
    setFilePath(result.path);
  }
}

function handleNew() {
  const { setSchema, setFilePath } = useSchemaStore.getState();
  setSchema(createEmptySchema());
  setFilePath(null);
}

function handleUndo() {
  useSchemaStore.temporal.getState().undo();
}

function handleRedo() {
  useSchemaStore.temporal.getState().redo();
}

let menuInitialized = false;

async function setupMenu() {
  if (menuInitialized) return;
  menuInitialized = true;

  const appSubmenu = await Submenu.new({
    text: "SocaDB",
    items: [
      await MenuItem.new({
        id: "about",
        text: "About SocaDB",
        enabled: false,
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Services" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Hide", text: "Hide SocaDB" }),
      await PredefinedMenuItem.new({ item: "HideOthers" }),
      await PredefinedMenuItem.new({ item: "ShowAll" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Quit", text: "Quit SocaDB" }),
    ],
  });

  const fileSubmenu = await Submenu.new({
    text: "File",
    items: [
      await MenuItem.new({
        id: "new",
        text: "New Schema",
        accelerator: "CmdOrCtrl+N",
        action: () => handleNew(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "open",
        text: "Open...",
        accelerator: "CmdOrCtrl+O",
        action: () => void handleOpen(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "save",
        text: "Save",
        accelerator: "CmdOrCtrl+S",
        action: () => void handleSave(),
      }),
      await MenuItem.new({
        id: "save_as",
        text: "Save As...",
        accelerator: "CmdOrCtrl+Shift+S",
        action: () => void handleSaveAs(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "export_png",
        text: "Export PNG...",
        accelerator: "CmdOrCtrl+E",
        action: () => void exportCanvasPng(),
      }),
    ],
  });

  const editSubmenu = await Submenu.new({
    text: "Edit",
    items: [
      await MenuItem.new({
        id: "undo",
        text: "Undo",
        accelerator: "CmdOrCtrl+Z",
        action: () => handleUndo(),
      }),
      await MenuItem.new({
        id: "redo",
        text: "Redo",
        accelerator: "CmdOrCtrl+Shift+Z",
        action: () => handleRedo(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Cut" }),
      await PredefinedMenuItem.new({ item: "Copy" }),
      await PredefinedMenuItem.new({ item: "Paste" }),
      await PredefinedMenuItem.new({ item: "SelectAll" }),
    ],
  });

  const viewSubmenu = await Submenu.new({
    text: "View",
    items: [await PredefinedMenuItem.new({ item: "Fullscreen" })],
  });

  const windowSubmenu = await Submenu.new({
    text: "Window",
    items: [
      await PredefinedMenuItem.new({ item: "Minimize" }),
      await PredefinedMenuItem.new({ item: "CloseWindow" }),
    ],
  });

  const menu = await Menu.new({
    items: [appSubmenu, fileSubmenu, editSubmenu, viewSubmenu, windowSubmenu],
  });

  await menu.setAsAppMenu();
}

export function useAppMenu() {
  useEffect(() => {
    void setupMenu();
  }, []);
}
