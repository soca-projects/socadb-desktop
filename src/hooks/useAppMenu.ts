import { useEffect } from "react";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { emit } from "@tauri-apps/api/event";
import { useSchemaStore } from "../stores/schemaStore";
import {
  openSchemaFile,
  saveSchemaFile,
  saveSchemaFileAs,
} from "../utils/fileOperations";
import { handleUndo, handleRedo } from "../utils/schemaActions";
import { useThemeStore } from "../stores/themeStore";
import { exportCanvasPng } from "../utils/exportPng";
import { exportCanvasSvg } from "../utils/exportSvg";
import { exportSql } from "../utils/exportSql";

async function handleSave() {
  const { schema, filePath, setFilePath, markSaved } = useSchemaStore.getState();
  if (filePath) {
    await saveSchemaFile(schema, filePath);
    markSaved();
  } else {
    const path = await saveSchemaFileAs(schema);
    if (path) {
      setFilePath(path);
      markSaved();
    }
  }
}

async function handleSaveAs() {
  const { schema, setFilePath, markSaved } = useSchemaStore.getState();
  const path = await saveSchemaFileAs(schema);
  if (path) {
    setFilePath(path);
    markSaved();
  }
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
  void emit("new-schema-requested");
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
        action: () => void exportCanvasPng(),
      }),
      await MenuItem.new({
        id: "export_svg",
        text: "Export SVG...",
        action: () => void exportCanvasSvg(),
      }),
      await MenuItem.new({
        id: "export_sql",
        text: "Export SQL...",
        accelerator: "CmdOrCtrl+E",
        action: () => void exportSql(),
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
    items: [
      await MenuItem.new({
        id: "toggle_sidebar",
        text: "Toggle Sidebar",
        accelerator: "CmdOrCtrl+B",
        action: () => void emit("toggle-sidebar"),
      }),
      await MenuItem.new({
        id: "toggle_focus",
        text: "Focus Mode",
        accelerator: "CmdOrCtrl+Shift+F",
        action: () => void emit("toggle-focus-mode"),
      }),
      await MenuItem.new({
        id: "toggle_theme",
        text: "Toggle Theme",
        accelerator: "CmdOrCtrl+Shift+T",
        action: () => useThemeStore.getState().toggleTheme(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Fullscreen" }),
    ],
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
