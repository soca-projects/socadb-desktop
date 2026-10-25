#!/usr/bin/env node
// Each module starts running when imported, so only the requested one is loaded.
const [command, provider] = process.argv.slice(2);

if (command === "agent") {
  if (provider === "claude") await import("./agent-runner-claude.ts");
  else if (provider === "codex") await import("./agent-runner-codex.ts");
  else {
    console.error(`Unknown agent: ${provider}`);
    process.exit(2);
  }
} else {
  await import("./server.ts");
}

export {};
