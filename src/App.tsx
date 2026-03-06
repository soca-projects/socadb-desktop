import { Canvas } from "./components/Canvas/Canvas";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

function App() {
  useKeyboardShortcuts();
  return <Canvas />;
}

export default App;
