import { useEffect } from "react";
import { Canvas } from "./components/Canvas/Canvas";
import { ErrorBoundary } from "./components/ErrorBoundary/ErrorBoundary";
import { NewSchemaModal } from "./components/NewSchemaModal/NewSchemaModal";
import { useAppMenu } from "./hooks/useAppMenu";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useNewSchemaModal } from "./hooks/useNewSchemaModal";
import { registerMcpServers } from "./utils/mcpRegistration";
import { initSessionPersistence } from "./utils/sessionPersistence";

initSessionPersistence();

function App() {
  useAppMenu();
  useMcpBridge();

  const { isOpen, isFirstLaunch, handleCreate, handleClose } = useNewSchemaModal();

  useEffect(() => {
    void registerMcpServers();
  }, []);

  return (
    <ErrorBoundary>
      <Canvas />
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
