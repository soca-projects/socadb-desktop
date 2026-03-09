import { useEffect } from "react";
import { Canvas } from "./components/Canvas/Canvas";
import { useAppMenu } from "./hooks/useAppMenu";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { registerMcpServers } from "./utils/mcpRegistration";

function App() {
  useAppMenu();
  useMcpBridge();

  useEffect(() => {
    void registerMcpServers();
  }, []);

  return <Canvas />;
}

export default App;
