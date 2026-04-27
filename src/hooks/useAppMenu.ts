import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { emit, listen } from "@tauri-apps/api/event";
import { useSchemaStore } from "../stores/schemaStore";
import {
  saveCurrentSchema,
  saveSchemaFileAs,
  openAndApplySchema,
  openRecentFile,
} from "../utils/fileOperations";
import { handleUndo, handleRedo } from "../utils/schemaActions";
import {
  addRecentFile,
  getRecentFiles,
  clearRecentFiles,
  loadRecentFiles,
} from "../utils/recentFiles";
import { useThemeStore } from "../stores/themeStore";
import { toast } from "sonner";
import i18next from "../i18n";

function handleSave() {
  void saveCurrentSchema();
}

async function handleSaveAs() {
  try {
    const { schema, setFilePath, markSaved } = useSchemaStore.getState();
    const path = await saveSchemaFileAs(schema);
    if (path) {
      setFilePath(path);
      markSaved();
      addRecentFile(path);
    }
  } catch (e) {
    toast.error(i18next.t("toast.saveFailed", { error: String(e) }));
  }
}

function isDirty() {
  const { schema, savedAt } = useSchemaStore.getState();
  return savedAt !== schema.updatedAt;
}

function handleOpen() {
  if (isDirty()) {
    void emit("unsaved-guard-open");
    return;
  }
  void openAndApplySchema();
}

function handleNew() {
  if (isDirty()) {
    void emit("unsaved-guard-new");
    return;
  }
  void emit("new-schema-requested");
}

function handleOpenRecent(filePath: string) {
  if (isDirty()) {
    void emit("unsaved-guard-open-recent", filePath);
    return;
  }
  void openRecentFile(filePath);
}

async function buildRecentSubmenu(): Promise<Submenu> {
  const t = i18next.t.bind(i18next);
  const recentFiles = getRecentFiles();

  const items: (MenuItem | PredefinedMenuItem)[] = [];

  if (recentFiles.length === 0) {
    items.push(
      await MenuItem.new({
        id: "no_recent",
        text: t("menu.noRecent"),
        enabled: false,
      }),
    );
  } else {
    for (const entry of recentFiles) {
      const parts = entry.path.split(/[/\\]/);
      const filename = parts.pop() ?? entry.path;
      const parent = parts.pop();
      const label = parent ? `${parent}/${filename}` : filename;
      items.push(
        await MenuItem.new({
          id: `recent_${entry.path}`,
          text: label,
          action: () => handleOpenRecent(entry.path),
        }),
      );
    }
    items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    items.push(
      await MenuItem.new({
        id: "clear_recent",
        text: t("menu.clearRecent"),
        action: () => clearRecentFiles(),
      }),
    );
  }

  return Submenu.new({
    id: "open_recent",
    text: t("menu.openRecent"),
    items,
  });
}

let recentLoaded = false;

async function setupMenu() {
  if (!recentLoaded) {
    await loadRecentFiles();
    recentLoaded = true;
  }
  const t = i18next.t.bind(i18next);

  const appSubmenu = await Submenu.new({
    text: "SocaDB",
    items: [
      await MenuItem.new({
        id: "about",
        text: t("menu.about"),
        enabled: false,
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Services" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Hide", text: t("menu.hideSocaDB") }),
      await PredefinedMenuItem.new({ item: "HideOthers" }),
      await PredefinedMenuItem.new({ item: "ShowAll" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Quit", text: t("menu.quitSocaDB") }),
    ],
  });

  const fileSubmenu = await Submenu.new({
    text: t("menu.file"),
    items: [
      await MenuItem.new({
        id: "new",
        text: t("menu.newSchema"),
        accelerator: "CmdOrCtrl+N",
        action: () => handleNew(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "open",
        text: t("menu.open"),
        accelerator: "CmdOrCtrl+O",
        action: () => void handleOpen(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await buildRecentSubmenu(),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "save",
        text: t("menu.save"),
        accelerator: "CmdOrCtrl+S",
        action: () => void handleSave(),
      }),
      await MenuItem.new({
        id: "save_as",
        text: t("menu.saveAs"),
        accelerator: "CmdOrCtrl+Shift+S",
        action: () => void handleSaveAs(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "import",
        text: t("menu.import"),
        accelerator: "CmdOrCtrl+I",
        action: () => void emit("open-import"),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "export",
        text: t("menu.export"),
        accelerator: "CmdOrCtrl+E",
        action: () => void emit("open-export"),
      }),
    ],
  });

  const editSubmenu = await Submenu.new({
    text: t("menu.edit"),
    items: [
      await MenuItem.new({
        id: "undo",
        text: t("menu.undo"),
        accelerator: "CmdOrCtrl+Z",
        action: () => handleUndo(),
      }),
      await MenuItem.new({
        id: "redo",
        text: t("menu.redo"),
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
    text: t("menu.view"),
    items: [
      await MenuItem.new({
        id: "toggle_sidebar",
        text: t("menu.toggleSidebar"),
        accelerator: "CmdOrCtrl+B",
        action: () => void emit("toggle-sidebar"),
      }),
      await MenuItem.new({
        id: "toggle_focus",
        text: t("menu.focusMode"),
        accelerator: "CmdOrCtrl+Shift+F",
        action: () => void emit("toggle-focus-mode"),
      }),
      await MenuItem.new({
        id: "toggle_theme",
        text: t("menu.toggleTheme"),
        accelerator: "CmdOrCtrl+Shift+T",
        action: () => useThemeStore.getState().toggleTheme(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Fullscreen" }),
    ],
  });

  const windowSubmenu = await Submenu.new({
    text: t("menu.window"),
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
  const { i18n } = useTranslation();

  useEffect(() => {
    void setupMenu();

    const unlistens = [listen("refresh-menu", () => void setupMenu())];
    return () => {
      for (const u of unlistens) void u.then((fn) => fn());
    };
  }, [i18n.resolvedLanguage]);
}
