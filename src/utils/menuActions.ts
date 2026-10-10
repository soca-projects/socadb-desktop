import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import i18next from "../i18n";
import { useSchemaStore } from "../stores/schemaStore";
import { useThemeStore } from "../stores/themeStore";
import { useViewStore } from "../stores/viewStore";
import {
  openAndApplySchema,
  openRecentFile,
  saveCurrentSchema,
  saveSchemaFileAs,
} from "./fileOperations";
import { addRecentFile } from "./recentFiles";
import { closeSchema, handleRedo, handleUndo } from "./schemaActions";
import { isWorthResuming } from "./schemaQueries";

// Inline editors (e.g. column rename inputs in SidePanel) commit their value
// on blur, not on every keystroke. Force a blur before any destructive or
// state-reading action so what the user sees on screen is what reaches the
// store — otherwise Ctrl+S saves the pre-edit value and Ctrl+N/O could replace
// the schema without the in-progress rename being visible to the dirty-check.
function commitActiveEdit() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function handleSave() {
  commitActiveEdit();
  void saveCurrentSchema();
}

export async function handleSaveAs() {
  commitActiveEdit();
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
  const { schema, filePath, savedAt } = useSchemaStore.getState();
  return savedAt !== schema.updatedAt && isWorthResuming(schema, filePath);
}

export function handleOpen() {
  commitActiveEdit();
  if (isDirty()) {
    void emit("unsaved-guard-open");
    return;
  }
  void openAndApplySchema();
}

export function handleNew() {
  commitActiveEdit();
  if (isDirty()) {
    void emit("unsaved-guard-new");
    return;
  }
  void emit("new-schema-requested");
}

export function handleHomeImport() {
  commitActiveEdit();
  if (isDirty()) {
    void emit("unsaved-guard-import");
    return;
  }
  useViewStore.getState().requestImport();
}

function isEditor() {
  return useViewStore.getState().view === "editor";
}

export function handleShowHome() {
  commitActiveEdit();
  useViewStore.getState().showHome();
}

export function handleFindSchema() {
  commitActiveEdit();
  useViewStore.getState().requestSearch();
}

export function handleCloseSchema() {
  commitActiveEdit();
  const { schema, filePath } = useSchemaStore.getState();
  if (!isWorthResuming(schema, filePath)) {
    useViewStore.getState().showHome();
    return;
  }
  if (isDirty()) {
    void emit("unsaved-guard-close");
    return;
  }
  closeSchema();
}

export function handleOpenRecent(filePath: string) {
  commitActiveEdit();
  if (isDirty()) {
    void emit("unsaved-guard-open-recent", filePath);
    return;
  }
  void openRecentFile(filePath);
}

// Closing the window triggers WindowEvent::Destroyed which runs the agent +
// port-file cleanup on the Rust side. exit() from plugin-process would skip
// that cleanup and orphan bun.exe subprocesses on Windows. In-memory schema
// edits are preserved by sessionPersistence (localStorage), so there is no
// need to gate this behind an unsaved-changes prompt — same behavior as
// clicking the window's close button.
export function handleQuit() {
  void getCurrentWindow().close();
}

export interface MenuShortcut {
  /** muda accelerator string consumed by Tauri's MenuItem.new */
  accelerator: string;
  /** Lowercase Ctrl+...+key signature derived from a KeyboardEvent. Used by
   * the Windows fallback hook since Tauri doesn't wire menu accelerators to
   * the Win32 message loop. */
  windowsSignature: string;
  run: () => void | Promise<void>;
}

function toWindowsSignature(accelerator: string): string {
  return accelerator.toLowerCase().replaceAll("cmdorctrl", "ctrl");
}

function shortcut(accelerator: string, run: () => void | Promise<void>): MenuShortcut {
  return { accelerator, windowsSignature: toWindowsSignature(accelerator), run };
}

export const MENU_SHORTCUTS = {
  newSchema: shortcut("CmdOrCtrl+N", () => handleNew()),
  open: shortcut("CmdOrCtrl+O", () => handleOpen()),
  save: shortcut("CmdOrCtrl+S", () => handleSave()),
  saveAs: shortcut("CmdOrCtrl+Shift+S", () => handleSaveAs()),
  home: shortcut("CmdOrCtrl+Shift+H", () => handleShowHome()),
  findSchema: shortcut("CmdOrCtrl+F", () => handleFindSchema()),
  closeSchema: shortcut("CmdOrCtrl+W", () => handleCloseSchema()),
  closeWindow: shortcut("CmdOrCtrl+Shift+W", () => handleQuit()),
  import: shortcut("CmdOrCtrl+I", () => {
    if (!isEditor()) {
      handleHomeImport();
      return;
    }
    commitActiveEdit();
    void emit("open-import");
  }),
  export: shortcut("CmdOrCtrl+E", () => {
    if (!isEditor()) return;
    commitActiveEdit();
    void emit("open-export");
  }),
  quit: shortcut("CmdOrCtrl+Q", () => handleQuit()),
  undo: shortcut("CmdOrCtrl+Z", () => {
    if (isEditor()) handleUndo();
  }),
  redo: shortcut("CmdOrCtrl+Shift+Z", () => {
    if (isEditor()) handleRedo();
  }),
  toggleSidebar: shortcut("CmdOrCtrl+B", () => void emit("toggle-sidebar")),
  toggleFocus: shortcut("CmdOrCtrl+Shift+F", () => void emit("toggle-focus-mode")),
  toggleTheme: shortcut("CmdOrCtrl+Shift+T", () =>
    useThemeStore.getState().toggleTheme(),
  ),
} as const;
