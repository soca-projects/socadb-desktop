import { useEffect, useState, useCallback } from "react";
import { Toaster } from "sonner";
import { Canvas } from "./components/Canvas/Canvas";
import { Home } from "./components/Home/Home";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { SettingsModal } from "./components/SettingsModal/SettingsModal";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { NewSchemaModal } from "./components/NewSchemaModal/NewSchemaModal";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal/UnsavedChangesModal";
import { useAppMenu } from "./hooks/useAppMenu";
import { useWindowsKeyboardShortcuts } from "./hooks/useWindowsKeyboardShortcuts";
import { useAutoUpdate } from "./hooks/useAutoUpdate";
import { useInstallOnNextLaunch } from "./hooks/useInstallOnNextLaunch";
import { useUpdateReadyToast } from "./hooks/useUpdateReadyToast";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useChatStream } from "./hooks/useChatStream";
import { useNewSchemaModal } from "./hooks/useNewSchemaModal";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { NARROW_WINDOW_QUERY, TOOLBAR_HEIGHT } from "./utils/layout";
import { useThemeStore } from "./stores/themeStore";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { syncIntegrations } from "./utils/mcpRegistration";
import { initSessionPersistence, restoreLastSession } from "./utils/sessionPersistence";
import { useViewStore } from "./stores/viewStore";
import {
  getStartupPreference,
  initialView,
  loadStartupPreference,
} from "./utils/startupPreference";
import { initChatPersistence } from "./utils/chatPersistence";
import { initThemePersistence } from "./utils/themePersistence";
import { initLanguagePersistence } from "./utils/languagePersistence";

const restored = restoreLastSession();
useViewStore.setState({ view: initialView(restored, getStartupPreference()) });
initSessionPersistence();
void loadStartupPreference();
initChatPersistence();
initThemePersistence();
initLanguagePersistence();

function App() {
  useAppMenu();
  useWindowsKeyboardShortcuts();
  useAutoUpdate();
  useInstallOnNextLaunch();
  useUpdateReadyToast();
  useMcpBridge();
  useChatStream();

  const { isOpen, handleCreate, handleClose } = useNewSchemaModal();
  const unsavedGuard = useUnsavedChangesGuard();
  const narrowWindow = useMediaQuery(NARROW_WINDOW_QUERY);
  const theme = useThemeStore((s) => s.theme);
  const view = useViewStore((s) => s.view);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    void syncIntegrations();
  }, []);

  return (
    <ErrorBoundary>
      {view === "home" ? (
        <Home onOpenSettings={openSettings} />
      ) : (
        <Canvas onOpenSettings={openSettings} />
      )}
      {/* Kept mounted so a draft message survives a trip to the home. */}
      <div hidden={view === "home"}>
        <ChatPanel />
      </div>
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
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
