import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

function handleQuit() {
  // Closing the window triggers WindowEvent::Destroyed which runs the agent +
  // port-file cleanup on the Rust side. exit() from plugin-process would skip
  // that cleanup and orphan bun.exe subprocesses on Windows. In-memory schema
  // edits are preserved by sessionPersistence (localStorage), so there is no
  // need to gate this behind an unsaved-changes prompt — same behavior as
  // clicking the window's close button.
  void getCurrentWindow().close();
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

// macOS has a global app menu bar; Windows/Linux only have per-window menus.
// We use IS_MAC both to skip the macOS-only "SocaDB" submenu (Hide/HideOthers/
// ShowAll/Quit are PredefinedMenuItem variants that only render on macOS) and
// to pick the right attach method (setAsAppMenu vs setAsWindowMenu) — on
// non-macOS, setAsAppMenu is a no-op so accelerators silently never register.
// IS_LINUX is used to skip predefined items muda flags as "Linux: Unsupported"
// (CloseWindow, Hide) — they would render as dead entries otherwise.
const PLATFORM = navigator.platform.toLowerCase();
const IS_MAC = PLATFORM.includes("mac");
const IS_LINUX = PLATFORM.includes("linux");

async function buildAppSubmenu(): Promise<Submenu> {
  const t = i18next.t.bind(i18next);
  return Submenu.new({
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
}

async function setupMenu() {
  if (!recentLoaded) {
    await loadRecentFiles();
    recentLoaded = true;
  }
  const t = i18next.t.bind(i18next);

  const appSubmenu = IS_MAC ? await buildAppSubmenu() : null;

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
      // On macOS, Quit lives in the dedicated app submenu and the system
      // wires Cmd+Q automatically. On Windows/Linux the convention is to put
      // it at the bottom of File, and muda's PredefinedMenuItem.Quit doesn't
      // bind a standard accelerator outside macOS — so we build a regular
      // MenuItem with an explicit accelerator. The action routes through
      // handleQuit so unsaved changes prompt the same modal as open/new.
      ...(IS_MAC
        ? []
        : [
            await PredefinedMenuItem.new({ item: "Separator" }),
            await MenuItem.new({
              id: "exit",
              text: t("menu.exit"),
              accelerator: "CmdOrCtrl+Q",
              action: () => handleQuit(),
            }),
          ]),
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
      // Fullscreen predefined item is macOS-only per muda — on Windows/Linux
      // it would render a dead menu entry.
      ...(IS_MAC
        ? [
            await PredefinedMenuItem.new({ item: "Separator" }),
            await PredefinedMenuItem.new({ item: "Fullscreen" }),
          ]
        : []),
    ],
  });

  const windowSubmenu = await Submenu.new({
    text: t("menu.window"),
    items: [
      await PredefinedMenuItem.new({ item: "Minimize" }),
      // CloseWindow is "Linux: Unsupported" per muda — skip on Linux to
      // avoid a dead menu entry.
      ...(IS_LINUX ? [] : [await PredefinedMenuItem.new({ item: "CloseWindow" })]),
    ],
  });

  const items = appSubmenu
    ? [appSubmenu, fileSubmenu, editSubmenu, viewSubmenu, windowSubmenu]
    : [fileSubmenu, editSubmenu, viewSubmenu, windowSubmenu];
  const menu = await Menu.new({ items });

  if (IS_MAC) {
    await menu.setAsAppMenu();
  } else {
    await menu.setAsWindowMenu();
  }
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
