import { Canvas } from "./components/Canvas/Canvas";
import { useAppMenu } from "./hooks/useAppMenu";

function App() {
  useAppMenu();
  return <Canvas />;
}

export default App;
