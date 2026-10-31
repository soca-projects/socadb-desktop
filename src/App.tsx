import { useEffect } from "react";
import { Toaster } from "sonner";
import { Canvas } from "./components/Canvas/Canvas";
import { Home } from "./components/Home/Home";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { SettingsModal } from "./components/SettingsModal/SettingsModal";
import { AboutModal } from "./components/AboutModal/AboutModal";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { NewSchemaModal } from "./components/NewSchemaModal/NewSchemaModal";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal/UnsavedChangesModal";
import { ReleaseNotesModal } from "./components/WhatsNew/ReleaseNotesModal";
import { useAppMenu } from "./hooks/useAppMenu";
import { useWindowsKeyboardShortcuts } from "./hooks/useWindowsKeyboardShortcuts";
import { useAutoUpdate } from "./hooks/useAutoUpdate";
import { useInstallOnNextLaunch } from "./hooks/useInstallOnNextLaunch";
import { useUpdateReadyToast } from "./hooks/useUpdateReadyToast";
import { useWhatsNewToast } from "./hooks/useWhatsNewToast";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useChatStream } from "./hooks/useChatStream";
import { useNewSchemaModal } from "./hooks/useNewSchemaModal";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useFullscreenTracking } from "./hooks/useFullscreenTracking";
import { NARROW_WINDOW_QUERY, TOOLBAR_HEIGHT } from "./utils/layout";
import { followSystemTheme, useThemeStore } from "./stores/themeStore";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { useOpenedFiles } from "./hooks/useOpenedFiles";
import { useRecentFilesLoaded } from "./hooks/useRecentFiles";
import { notifyRegistered, syncIntegrations } from "./utils/mcpRegistration";
import { initSessionPersistence, restoreLastSession } from "./utils/sessionPersistence";
import { useViewStore } from "./stores/viewStore";
import { useReleaseNotesStore } from "./stores/releaseNotesStore";
import {
  getStartupPreference,
  initialView,
  loadStartupPreference,
} from "./utils/startupPreference";
import { loadPrimaryKeyPreference } from "./utils/primaryKeyPreference";
import { startWhatsNew } from "./utils/whatsNew";
import { initChatPersistence } from "./utils/chatPersistence";
import { initThemePersistence } from "./utils/themePersistence";
import { initLanguagePersistence } from "./utils/languagePersistence";
import { initContextMenu } from "./utils/contextMenu";
import { initFieldUndo } from "./utils/fieldUndo";
import { initWindowTheme } from "./utils/windowTheme";
import { initDocumentEdited } from "./utils/documentEdited";

const restored = restoreLastSession();
useViewStore.setState({ view: initialView(restored, getStartupPreference()) });
initSessionPersistence();
initDocumentEdited();
void loadStartupPreference();
void loadPrimaryKeyPreference();
void startWhatsNew();
initChatPersistence();
initThemePersistence();
followSystemTheme();
initWindowTheme();
initLanguagePersistence();
initContextMenu();
initFieldUndo();

function App() {
  useAppMenu();
  useWindowsKeyboardShortcuts();
  useAutoUpdate();
  useInstallOnNextLaunch();
  useUpdateReadyToast();
  useWhatsNewToast();
  useMcpBridge();
  useChatStream();
  useFullscreenTracking();

  const { isOpen, handleCreate, handleClose } = useNewSchemaModal();
  const unsavedGuard = useUnsavedChangesGuard();
  const recentsLoaded = useRecentFilesLoaded();
  // A file opened at launch would ask the guard before it listens, and its
  // recents entry would overwrite the list before it is read.
  useOpenedFiles(unsavedGuard.ready && recentsLoaded);
  const narrowWindow = useMediaQuery(NARROW_WINDOW_QUERY);
  const theme = useThemeStore((s) => s.theme);
  const view = useViewStore((s) => s.view);
  const settingsOpen = useViewStore((s) => s.settingsOpen);
  const closeSettings = useViewStore((s) => s.closeSettings);
  const aboutOpen = useViewStore((s) => s.aboutOpen);
  const closeAbout = useViewStore((s) => s.closeAbout);
  const releaseNotes = useReleaseNotesStore((s) => s.modal);
  const closeNotes = useReleaseNotesStore((s) => s.closeNotes);

  useEffect(() => {
    void syncIntegrations().then(notifyRegistered);
  }, []);

  return (
    <ErrorBoundary>
      {view === "home" ? <Home /> : <Canvas />}
      {/* Kept mounted so a draft message survives a trip to the home. */}
      <div hidden={view === "home"}>
        <ChatPanel />
      </div>
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
      {aboutOpen && <AboutModal onClose={closeAbout} />}
      {releaseNotes && <ReleaseNotesModal notes={releaseNotes} onClose={closeNotes} />}
      {isOpen && <NewSchemaModal onClose={handleClose} onCreate={handleCreate} />}
      {unsavedGuard.isOpen && (
        <UnsavedChangesModal
          onCancel={unsavedGuard.handleCancel}
          onDiscard={unsavedGuard.handleDiscard}
          onSave={unsavedGuard.handleSave}
        />
      )}
      {/* On a narrow window the chat box sits where bottom toasts would land. */}
      <Toaster
        theme={theme}
        position={narrowWindow ? "top-center" : "bottom-center"}
        offset={narrowWindow ? { top: TOOLBAR_HEIGHT + 12 } : undefined}
        richColors
      />
    </ErrorBoundary>
  );
}

export default App;
