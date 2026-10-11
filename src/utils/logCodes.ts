type LogLevel = "debug" | "info" | "warn" | "error";

interface LogCodeInfo {
  level: LogLevel;
  meaning: string;
  check: string;
}

export const LOG_CODES = {
  "app.start": {
    level: "info",
    meaning: "The app process started; ctx has version, OS, arch and install location.",
    check:
      "Compare with the previous app.start: no app.stop in between means the last run crashed.",
  },
  "app.stop": {
    level: "info",
    meaning: "The app exited cleanly.",
    check: "Its absence before the next app.start is the crash signal.",
  },
  "app.panic": {
    level: "error",
    meaning: "Rust panicked; the process usually dies right after.",
    check:
      "ctx.location and ctx.backtrace point at the line; read the info lines just before it.",
  },
  "agent.spawn.failed": {
    level: "error",
    meaning: "The agent runner process (bun) could not be started.",
    check:
      "The message names the bun and runner paths: missing runtime in the bundle, or run `bun run build:mcp` in dev.",
  },
  "agent.stderr": {
    level: "info",
    meaning: "A line the agent runner wrote to stderr.",
    check:
      "Read it next to the agent.exit.* or agent.turn.error line of the same launch.",
  },
  "agent.exit.signal": {
    level: "error",
    meaning: "The agent runner was killed by a signal.",
    check:
      "ctx.signal: 9 = killed by the OS (memory pressure?) or by hand, 15 = asked to stop. ctx.stderr_tail has its last lines.",
  },
  "agent.exit.nonzero": {
    level: "error",
    meaning: "The agent runner exited with an error code.",
    check: "ctx.stderr_tail usually holds the exception; ctx.code is the exit code.",
  },
  "agent.exit.unexpected": {
    level: "warn",
    meaning: "The agent runner exited with code 0 while it was still the current one.",
    check:
      "A runner should only end when SocaDB kills it; ctx.stderr_tail may say why it stopped.",
  },
  "agent.exit.wait_failed": {
    level: "error",
    meaning: "SocaDB could not read the runner's exit status.",
    check: "Rare OS-level failure; look at the surrounding agent.* lines.",
  },
  "agent.restart": {
    level: "warn",
    meaning:
      "Writing to the runner failed, so SocaDB restarted it before sending the message.",
    check:
      "Look for the agent.exit.* line that explains why the previous runner was gone.",
  },
  "agent.cleanup.locked": {
    level: "warn",
    meaning:
      "On quit, the agent state was locked, so runner processes may outlive the app.",
    check: "Check for leftover bun processes after quitting.",
  },
  "keyring.read.failed": {
    level: "warn",
    meaning: "Reading an API key from the OS keychain failed (not just 'no key').",
    check:
      "Locked or denied keychain, or no backend on Linux; the message is the keyring error.",
  },
  "mcp.ws.listening": {
    level: "info",
    meaning: "The MCP bridge is listening and the port file was written.",
    check: "ctx.port must match ~/.socadb/.port while the app runs.",
  },
  "mcp.ws.start_failed": {
    level: "error",
    meaning:
      "The MCP bridge could not bind its port; agents and MCP clients can't reach the app.",
    check:
      "The message is the bind error; another process or a sandbox may block localhost.",
  },
  "mcp.port_file.write_failed": {
    level: "error",
    meaning: "~/.socadb/.port could not be written, so MCP clients can't find the app.",
    check: "Permissions or disk space on ~/.socadb.",
  },
  "mcp.ws.accept_failed": {
    level: "warn",
    meaning: "Accepting an MCP connection failed; the bridge keeps listening.",
    check: "Many in a row usually mean too many open files.",
  },
  "mcp.ws.handshake_failed": {
    level: "warn",
    meaning: "A connection to the bridge failed the WebSocket handshake.",
    check:
      "A browser origin is refused on purpose; otherwise a client spoke the wrong protocol.",
  },
  "mcp.ws.connected": {
    level: "debug",
    meaning: "An MCP client connected to the bridge.",
    check: "ctx.connection ties it to later lines.",
  },
  "mcp.ws.disconnected": {
    level: "debug",
    meaning: "An MCP client disconnected.",
    check: "Unexpected when a tool call was in flight.",
  },
  "mcp.ws.receive_failed": {
    level: "warn",
    meaning: "Reading from an MCP client failed and the connection was dropped.",
    check: "Usually the client process died; see mcp-server.log for its side.",
  },
  "mcp.ws.send_failed": {
    level: "warn",
    meaning: "A reply could not be sent to an MCP client; the connection was dropped.",
    check: "The client is gone; the agent's tool call will time out.",
  },
  "updater.sparkle.config_failed": {
    level: "warn",
    meaning: "Sparkle could not be configured at start (channel or install-on-quit).",
    check:
      "ctx.step says which; updates may use the wrong channel or Sparkle's own prompt.",
  },
  "chat.conversation.unreadable": {
    level: "warn",
    meaning: "A conversation file could not be read and was skipped.",
    check: "ctx.file in ~/.socadb/conversations; permissions or a half-written file.",
  },
  "ui.start": {
    level: "info",
    meaning: "The interface loaded; ctx has language, theme, view and launch preference.",
    check: "Follows app.start in the same launch.",
  },
  "ui.uncaught": {
    level: "error",
    meaning: "An uncaught JavaScript error.",
    check:
      "ctx.stack, ctx.source and ctx.line; the info lines before show what the user did.",
  },
  "ui.unhandled_rejection": {
    level: "error",
    meaning: "A promise rejected with nobody handling it.",
    check: "ctx.stack; often a `void someAsync()` without a catch.",
  },
  "ui.render_crash": {
    level: "error",
    meaning: "A React render threw; the error screen replaced the app.",
    check: "ctx.componentStack names the component; ctx.stack the line.",
  },
  "view.change": {
    level: "info",
    meaning: "The window switched between the home and the editor.",
    check: "Context for the lines that follow.",
  },
} satisfies Record<string, LogCodeInfo>;

export type LogCode = keyof typeof LOG_CODES;
