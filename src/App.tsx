import { useEffect } from "react";
import { Canvas } from "./components/Canvas/Canvas";
import { NewSchemaModal } from "./components/NewSchemaModal/NewSchemaModal";
import { useAppMenu } from "./hooks/useAppMenu";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useNewSchemaModal } from "./hooks/useNewSchemaModal";
import { registerMcpServers } from "./utils/mcpRegistration";

function App() {
  useAppMenu();
  useMcpBridge();

  const { isOpen, isFirstLaunch, handleCreate, handleClose } = useNewSchemaModal();

  useEffect(() => {
    void registerMcpServers();
  }, []);

  return (
    <>
      <Canvas />
      {isOpen && (
        <NewSchemaModal
          isFirstLaunch={isFirstLaunch}
          onClose={handleClose}
          onCreate={handleCreate}
        />
      )}
    </>
  );
}

export default App;
