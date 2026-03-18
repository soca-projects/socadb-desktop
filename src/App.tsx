import { useEffect, useState, useCallback } from "react";
import { Canvas } from "./components/Canvas/Canvas";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { AgentSetupModal } from "./components/AgentSetupModal/AgentSetupModal";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { NewSchemaModal } from "./components/NewSchemaModal/NewSchemaModal";
import { useAppMenu } from "./hooks/useAppMenu";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useChatStream } from "./hooks/useChatStream";
import { useNewSchemaModal } from "./hooks/useNewSchemaModal";
import { registerMcpServers } from "./utils/mcpRegistration";
import { initSessionPersistence } from "./utils/sessionPersistence";
import { initChatPersistence } from "./utils/chatPersistence";

initSessionPersistence();
initChatPersistence();

function App() {
  useAppMenu();
  useMcpBridge();
  useChatStream();

  const { isOpen, isFirstLaunch, handleCreate, handleClose } = useNewSchemaModal();
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const openAgentSetup = useCallback(() => setAgentSetupOpen(true), []);
  const closeAgentSetup = useCallback(() => setAgentSetupOpen(false), []);

  useEffect(() => {
    void registerMcpServers();
  }, []);

  return (
    <ErrorBoundary>
      <Canvas onOpenAgentSetup={openAgentSetup} />
      <ChatPanel />
      {agentSetupOpen && <AgentSetupModal onClose={closeAgentSetup} />}
      {isOpen && (
        <NewSchemaModal
          isFirstLaunch={isFirstLaunch}
          onClose={handleClose}
          onCreate={handleCreate}
        />
      )}
    </ErrorBoundary>
  );
}

export default App;
