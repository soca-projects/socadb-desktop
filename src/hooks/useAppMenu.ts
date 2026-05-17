import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { listen } from "@tauri-apps/api/event";
import { getRecentFiles, clearRecentFiles, loadRecentFiles } from "../utils/recentFiles";
import { handleOpenRecent, MENU_SHORTCUTS } from "../utils/menuActions";
import { IS_MAC, IS_LINUX } from "../utils/platform";
import i18next from "../i18n";

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

// IS_MAC drives both the macOS-only "SocaDB" submenu (Hide/HideOthers/ShowAll/
// Quit are PredefinedMenuItem variants that only render on macOS) and the
// attach method (setAsAppMenu vs setAsWindowMenu). IS_LINUX skips predefined
// items muda flags as "Linux: Unsupported" (CloseWindow, Hide).

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
        accelerator: MENU_SHORTCUTS.newSchema.accelerator,
        action: () => void MENU_SHORTCUTS.newSchema.run(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "open",
        text: t("menu.open"),
        accelerator: MENU_SHORTCUTS.open.accelerator,
        action: () => void MENU_SHORTCUTS.open.run(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await buildRecentSubmenu(),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "save",
        text: t("menu.save"),
        accelerator: MENU_SHORTCUTS.save.accelerator,
        action: () => void MENU_SHORTCUTS.save.run(),
      }),
      await MenuItem.new({
        id: "save_as",
        text: t("menu.saveAs"),
        accelerator: MENU_SHORTCUTS.saveAs.accelerator,
        action: () => void MENU_SHORTCUTS.saveAs.run(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "import",
        text: t("menu.import"),
        accelerator: MENU_SHORTCUTS.import.accelerator,
        action: () => void MENU_SHORTCUTS.import.run(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "export",
        text: t("menu.export"),
        accelerator: MENU_SHORTCUTS.export.accelerator,
        action: () => void MENU_SHORTCUTS.export.run(),
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
              accelerator: MENU_SHORTCUTS.quit.accelerator,
              action: () => void MENU_SHORTCUTS.quit.run(),
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
        accelerator: MENU_SHORTCUTS.undo.accelerator,
        action: () => void MENU_SHORTCUTS.undo.run(),
      }),
      await MenuItem.new({
        id: "redo",
        text: t("menu.redo"),
        accelerator: MENU_SHORTCUTS.redo.accelerator,
        action: () => void MENU_SHORTCUTS.redo.run(),
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
        accelerator: MENU_SHORTCUTS.toggleSidebar.accelerator,
        action: () => void MENU_SHORTCUTS.toggleSidebar.run(),
      }),
      await MenuItem.new({
        id: "toggle_focus",
        text: t("menu.focusMode"),
        accelerator: MENU_SHORTCUTS.toggleFocus.accelerator,
        action: () => void MENU_SHORTCUTS.toggleFocus.run(),
      }),
      await MenuItem.new({
        id: "toggle_theme",
        text: t("menu.toggleTheme"),
        accelerator: MENU_SHORTCUTS.toggleTheme.accelerator,
        action: () => void MENU_SHORTCUTS.toggleTheme.run(),
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
