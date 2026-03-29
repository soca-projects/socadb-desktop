import { useEffect, useState, useCallback } from "react";
import { Toaster } from "sonner";
import { Canvas } from "./components/Canvas/Canvas";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { SettingsModal } from "./components/SettingsModal/SettingsModal";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { NewSchemaModal } from "./components/NewSchemaModal/NewSchemaModal";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal/UnsavedChangesModal";
import { useAppMenu } from "./hooks/useAppMenu";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useChatStream } from "./hooks/useChatStream";
import { useNewSchemaModal } from "./hooks/useNewSchemaModal";
import { useUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";
import { registerMcpServers } from "./utils/mcpRegistration";
import { initSessionPersistence } from "./utils/sessionPersistence";
import { initChatPersistence } from "./utils/chatPersistence";
import { initThemePersistence } from "./utils/themePersistence";
import { initLanguagePersistence } from "./utils/languagePersistence";

initSessionPersistence();
initChatPersistence();
initThemePersistence();
initLanguagePersistence();

function App() {
  useAppMenu();
  useMcpBridge();
  useChatStream();

  const { isOpen, isFirstLaunch, handleCreate, handleClose } = useNewSchemaModal();
  const unsavedGuard = useUnsavedChangesGuard();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => {
    void registerMcpServers();
  }, []);

  return (
    <ErrorBoundary>
      <Canvas onOpenSettings={openSettings} />
      <ChatPanel />
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
      {isOpen && (
        <NewSchemaModal
          isFirstLaunch={isFirstLaunch}
          onClose={handleClose}
          onCreate={handleCreate}
        />
      )}
      {unsavedGuard.isOpen && (
        <UnsavedChangesModal
          onCancel={unsavedGuard.handleCancel}
          onDiscard={unsavedGuard.handleDiscard}
          onSave={unsavedGuard.handleSave}
        />
      )}
      <Toaster position="bottom-center" richColors />
    </ErrorBoundary>
  );
}

export default App;
