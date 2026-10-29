import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { defaultWindowIcon, getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getRecentFiles, clearRecentFiles, loadRecentFiles } from "../utils/recentFiles";
import {
  handleOpenAbout,
  handleOpenRecent,
  handleShowLogs,
  MENU_SHORTCUTS,
} from "../utils/menuActions";
import { COPYRIGHT, WEBSITE } from "../utils/about";
import { handleUpdateMenuAction, updateMenuItemState } from "../utils/updater";
import { useUpdateStore } from "../stores/updateStore";
import { IS_LINUX, IS_MAC, IS_WINDOWS } from "../utils/platform";
import i18next from "../i18n";
import { logInfo } from "../utils/log";

const MENU_RECENT_LIMIT = 10;

async function buildRecentSubmenu(): Promise<Submenu> {
  const t = i18next.t.bind(i18next);
  const recentFiles = getRecentFiles().slice(0, MENU_RECENT_LIMIT);

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
          action: () => {
            logInfo("menu.action", "openRecent");
            handleOpenRecent(entry.path);
          },
        }),
      );
    }
    items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    items.push(
      await MenuItem.new({
        id: "clear_recent",
        text: t("menu.clearRecent"),
        action: () => {
          logInfo("menu.action", "clearRecent");
          clearRecentFiles();
        },
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
let updateMenuItem: MenuItem | null = null;

async function buildUpdateMenuItem(): Promise<MenuItem> {
  updateMenuItem = await MenuItem.new({
    id: "check_for_updates",
    ...updateMenuItemState(useUpdateStore.getState().status),
    action: () => handleUpdateMenuAction(),
  });
  return updateMenuItem;
}

async function syncUpdateMenuItem() {
  if (!updateMenuItem) return;
  const { text, enabled } = updateMenuItemState(useUpdateStore.getState().status);
  await updateMenuItem.setText(text);
  await updateMenuItem.setEnabled(enabled);
}

// macOS fills its standard panel from the bundle: icon, version, copyright and
// Credits.rtf. On Windows, muda's panel is a message box with English labels.
async function buildAboutItem(): Promise<MenuItem | PredefinedMenuItem> {
  const text = i18next.t("menu.about");
  if (IS_WINDOWS) return MenuItem.new({ id: "about", text, action: handleOpenAbout });
  const about = IS_MAC
    ? null
    : {
        name: "SocaDB",
        version: await getVersion(),
        copyright: COPYRIGHT,
        website: WEBSITE,
        websiteLabel: "socadb.com",
        icon: (await defaultWindowIcon()) ?? undefined,
      };
  return PredefinedMenuItem.new({ item: { About: about }, text });
}

async function buildSettingsItem(): Promise<MenuItem> {
  return MenuItem.new({
    id: "settings",
    text: i18next.t("menu.settings"),
    accelerator: MENU_SHORTCUTS.settings.accelerator,
    action: () => void MENU_SHORTCUTS.settings.run(),
  });
}

// IS_MAC drives both the macOS-only "SocaDB" submenu (Hide/HideOthers/ShowAll/
// Quit are PredefinedMenuItem variants that only render on macOS) and the
// attach method (setAsAppMenu vs setAsWindowMenu).

async function buildAppSubmenu(updateItem: MenuItem): Promise<Submenu> {
  const t = i18next.t.bind(i18next);
  return Submenu.new({
    text: "SocaDB",
    items: [
      await buildAboutItem(),
      updateItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await buildSettingsItem(),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Services", text: t("menu.services") }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Hide", text: t("menu.hideSocaDB") }),
      await PredefinedMenuItem.new({ item: "HideOthers", text: t("menu.hideOthers") }),
      await PredefinedMenuItem.new({ item: "ShowAll", text: t("menu.showAll") }),
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

  const updateItem = await buildUpdateMenuItem();
  const appSubmenu = IS_MAC ? await buildAppSubmenu(updateItem) : null;

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
        id: "home",
        text: t("menu.home"),
        accelerator: MENU_SHORTCUTS.home.accelerator,
        action: () => void MENU_SHORTCUTS.home.run(),
      }),
      await MenuItem.new({
        id: "find_schema",
        text: t("menu.findSchema"),
        accelerator: MENU_SHORTCUTS.findSchema.accelerator,
        action: () => void MENU_SHORTCUTS.findSchema.run(),
      }),
      await MenuItem.new({
        id: "close_schema",
        text: t("menu.closeSchema"),
        accelerator: MENU_SHORTCUTS.closeSchema.accelerator,
        action: () => void MENU_SHORTCUTS.closeSchema.run(),
      }),
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
            await buildSettingsItem(),
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
      await PredefinedMenuItem.new({ item: "Cut", text: t("menu.cut") }),
      await PredefinedMenuItem.new({ item: "Copy", text: t("menu.copy") }),
      await PredefinedMenuItem.new({ item: "Paste", text: t("menu.paste") }),
      await PredefinedMenuItem.new({ item: "SelectAll", text: t("menu.selectAll") }),
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
            await PredefinedMenuItem.new({
              item: "Fullscreen",
              text: t("menu.fullscreen"),
            }),
          ]
        : []),
    ],
  });

  const windowSubmenu = await Submenu.new({
    text: t("menu.window"),
    items: [
      // muda renders Minimize and Maximize as dead entries on Linux.
      ...(IS_LINUX
        ? []
        : [
            await PredefinedMenuItem.new({
              item: "Minimize",
              text: t(IS_MAC ? "menu.minimizeMac" : "menu.minimize"),
            }),
            await PredefinedMenuItem.new({
              item: "Maximize",
              text: t(IS_MAC ? "menu.zoom" : "menu.maximize"),
            }),
          ]),
      // The predefined CloseWindow is hardwired to Cmd+W, which closes the
      // schema here.
      await MenuItem.new({
        id: "close_window",
        text: t("menu.closeWindow"),
        accelerator: MENU_SHORTCUTS.closeWindow.accelerator,
        action: () => void MENU_SHORTCUTS.closeWindow.run(),
      }),
      ...(IS_MAC
        ? [
            await PredefinedMenuItem.new({ item: "Separator" }),
            await PredefinedMenuItem.new({
              item: "BringAllToFront",
              text: t("menu.bringAllToFront"),
            }),
          ]
        : []),
    ],
  });

  const showLogsItem = await MenuItem.new({
    id: "show_logs",
    text: t("menu.showLogs"),
    action: () => handleShowLogs(),
  });
  const items = appSubmenu
    ? [
        appSubmenu,
        fileSubmenu,
        editSubmenu,
        viewSubmenu,
        windowSubmenu,
        await Submenu.new({ text: t("menu.help"), items: [showLogsItem] }),
      ]
    : [
        fileSubmenu,
        editSubmenu,
        viewSubmenu,
        windowSubmenu,
        await Submenu.new({
          text: t("menu.help"),
          items: [
            updateItem,
            await PredefinedMenuItem.new({ item: "Separator" }),
            showLogsItem,
            await PredefinedMenuItem.new({ item: "Separator" }),
            await buildAboutItem(),
          ],
        }),
      ];
  // Never close the previous menu: Tauri drops the click handler of an id when
  // its item is freed, and every rebuild reuses the same ids.
  const menu = await Menu.new({ items });

  if (IS_MAC) {
    await menu.setAsAppMenu();
    await windowSubmenu.setAsWindowsMenuForNSApp();
  } else {
    await menu.setAsWindowMenu();
  }
  await syncUpdateMenuItem();
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

  useEffect(
    () =>
      useUpdateStore.subscribe((state, prev) => {
        if (state.status !== prev.status) void syncUpdateMenuItem();
      }),
    [],
  );
}
