import { mkdirSync, writeFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// scripts/acknowledgments.ts credits the packages that survive tree-shaking,
// which only Rollup knows.
function bundledModules(): Plugin {
  return {
    name: "socadb-bundled-modules",
    apply: "build",
    generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap((output) =>
        output.type === "chunk"
          ? Object.entries(output.modules)
              // Imported CSS goes to the stylesheet and renders no JS.
              .filter(
                ([id, module]) => module.renderedLength > 0 || /\.css($|\?)/.test(id),
              )
              .map(([id]) => id)
          : [],
      );
      mkdirSync("build", { recursive: true });
      writeFileSync("build/frontend-modules.json", JSON.stringify({ modules }));
    },
  };
}

export default defineConfig({
  plugins: [react(), bundledModules()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
