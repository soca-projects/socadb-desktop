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
  "app.log_dir.unwritable": {
    level: "warn",
    meaning:
      "The log directory couldn't be written at start, so lines go to stderr only.",
    check:
      "Ownership of the log dir (a root-owned folder after a sudo run?) or a read-only volume.",
  },
  "app.panic": {
    level: "error",
    meaning: "Rust panicked; the process usually dies right after.",
    check:
      "ctx.location and ctx.backtrace point at the line; read the info lines just before it.",
  },
  "app.show_logs.failed": {
    level: "error",
    meaning: "Help › Show Logs could not reveal the log file.",
    check: "The message from the opener plugin; the log dir may not exist yet.",
  },
  "agent.spawn.failed": {
    level: "error",
    meaning: "The agent runner process (bun) could not be started.",
    check:
      "The message names the bun and runner paths: missing runtime in the bundle, or run `bun run build:mcp` in dev.",
  },
  "agent.runtime.missing": {
    level: "error",
    meaning:
      "The bundled agent runtime (bun or a runner script) wasn't found, so no agent can start.",
    check: "A broken bundle; in dev run `bun run build:mcp` after switching branches.",
  },
  "agent.send.failed": {
    level: "error",
    meaning: "Sending a chat message to the agent failed before any reply.",
    check:
      "The message (api_key_missing, keyring_unavailable…) and the agent.* lines just before.",
  },
  "agent.stderr": {
    level: "debug",
    meaning: "Dev builds only: a line the agent runner wrote to stderr (500 chars max).",
    check:
      "In release, only the last 20 lines survive, in the stderr_tail of an agent.exit.* line.",
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
    level: "debug",
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
  "config.invalid": {
    level: "warn",
    meaning:
      "config.json wasn't valid JSON; it was copied to config.invalid.json and settings start fresh.",
    check:
      "~/.socadb/config.invalid.json holds the old settings (provider choices, integrations) to recover by hand.",
  },
  "mcp.registration.skipped": {
    level: "warn",
    meaning: "config.json couldn't be read at launch, so AI apps were left as they were.",
    check:
      "Look for config.invalid or a settings.*.persist_failed line; the next setting saved repairs config.json.",
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
  "log.suppressed": {
    level: "warn",
    meaning: "More than 20 lines of one code in a minute; the extra ones were dropped.",
    check:
      "ctx.code repeated ctx.dropped more times: a failure loop worth fixing on its own.",
  },
  "menu.action": {
    level: "info",
    meaning: "A menu command ran, from a click or its shortcut; msg is the command.",
    check: "Tells what the user triggered just before the lines that follow.",
  },
  "ui.action": {
    level: "info",
    meaning:
      "A click that moves the user: toolbar home, opening or resuming a schema from the home.",
    check: "Tells where a view.change came from.",
  },
  "ui.key": {
    level: "debug",
    meaning: "Dev builds only: a ⌘ or Ctrl shortcut pressed in the window.",
    check: "A shortcut with no menu.action after it never reached the menu.",
  },
  "view.change": {
    level: "info",
    meaning: "The window switched between the home and the editor.",
    check: "Context for the lines that follow.",
  },
  "file.open": {
    level: "info",
    meaning:
      "A schema was opened; ctx.file has where it is (never its name) and an id, ctx.tables the table count.",
    check: "Context for errors that follow in the editor.",
  },
  "file.open.failed": {
    level: "error",
    meaning: "Opening a schema failed for a reason other than missing or forbidden.",
    check: "The message: usually an invalid .soca (parse or migration) or an IO error.",
  },
  "file.open.not_found": {
    level: "warn",
    meaning: "The schema file no longer exists; it was dropped from the recents.",
    check: "ctx.file.where; moved or deleted outside SocaDB, or on a disconnected disk.",
  },
  "file.open.permission_denied": {
    level: "warn",
    meaning: "macOS privacy or file permissions refused to read the schema.",
    check:
      "ctx.file.where: ~/Documents, ~/Desktop or iCloud Drive → System Settings › Privacy & Security › Files & Folders.",
  },
  "file.save": {
    level: "info",
    meaning: "A schema was saved; ctx.file has where it is and an id.",
    check: "Context for later lines.",
  },
  "file.save.failed": {
    level: "error",
    meaning: "Saving the schema to its file failed.",
    check: "The message: disk full, permissions, or a read-only or removed volume.",
  },
  "file.save_as.failed": {
    level: "error",
    meaning: "Save As failed after choosing the path.",
    check: "The message: permissions or disk; the dialog itself succeeded.",
  },
  "export.sql.failed": {
    level: "error",
    meaning: "Writing the SQL export failed.",
    check: "The message; the file path was chosen in a save dialog.",
  },
  "export.svg.failed": {
    level: "error",
    meaning: "Rendering or writing the SVG export failed.",
    check: "The message; html-to-image rendering or the write.",
  },
  "export.json.failed": {
    level: "error",
    meaning: "Writing the JSON export failed.",
    check: "The message; the file path was chosen in a save dialog.",
  },
  "export.png.failed": {
    level: "error",
    meaning: "Rendering or writing the PNG export failed.",
    check: "The message; html-to-image rendering or the write.",
  },
  "export.png.render_failed": {
    level: "warn",
    meaning: "PNG rendering returned no image.",
    check:
      "html-to-image gave no blob: often an empty canvas or a WebKit canvas limit on huge schemas.",
  },
  "layout.auto.failed": {
    level: "error",
    meaning: "The automatic layout (ELK) threw.",
    check:
      "The message; reproduce with the same schema shape (table and relation count).",
  },
  "home.read.failed": {
    level: "warn",
    meaning: "A recent schema could not be read for its home card.",
    check: "ctx.file and the message: an invalid .soca shows as Unreadable on the home.",
  },
  "home.load.failed": {
    level: "error",
    meaning: "Loading the home's entries failed as a whole.",
    check: "Usually schema_files_info failed; the message is the IPC error.",
  },
  "home.reveal.failed": {
    level: "error",
    meaning: "Show in Finder/Explorer failed.",
    check: "The message from the opener plugin; the file may have moved.",
  },
  "home.duplicate.failed": {
    level: "error",
    meaning: "Duplicating a schema file failed.",
    check: "The message: not_found, exists after 999 tries, or an IO error.",
  },
  "home.rename.failed": {
    level: "warn",
    meaning: "Renaming a schema file was refused or failed.",
    check:
      "exists and invalid_name are user errors shown in the dialog; anything else is IO.",
  },
  "recent.persist.failed": {
    level: "error",
    meaning: "The recents list could not be written to ~/.socadb/recent.json.",
    check:
      "The message: permissions or disk on ~/.socadb; the home loses recent changes at restart.",
  },
  "recent.load.failed": {
    level: "error",
    meaning:
      "recent.json exists but couldn't be read; recents won't be saved this session.",
    check:
      "Permissions on ~/.socadb/recent.json; nothing is written until a later launch can read it.",
  },
  "recent.load.invalid": {
    level: "warn",
    meaning: "recent.json exists but doesn't parse; the list starts empty.",
    check:
      "The message names the bad field; the old list was copied to ~/.socadb/recent.invalid.json.",
  },
  "settings.startup.persist_failed": {
    level: "error",
    meaning: "The launch setting could not be written to config.json.",
    check:
      "A config.json that doesn't parse blocks the write on purpose; check the file.",
  },
  "settings.language.persist_failed": {
    level: "error",
    meaning: "The language could not be written to config.json.",
    check: "Permissions on ~/.socadb or a config.json that doesn't parse.",
  },
  "settings.theme.persist_failed": {
    level: "error",
    meaning: "The theme could not be written to config.json.",
    check: "Permissions on ~/.socadb or a config.json that doesn't parse.",
  },
  "session.save.failed": {
    level: "error",
    meaning:
      "The current schema could not be saved for the next launch (first failure only).",
    check: "localStorage full or unavailable; a huge schema can exceed WebKit's quota.",
  },
  "session.restore.invalid": {
    level: "warn",
    meaning: "The saved session didn't parse and was discarded.",
    check:
      "The message says which field failed; an unsaved draft from that session is lost.",
  },
  "chat.conversation.save_failed": {
    level: "error",
    meaning: "A conversation could not be written to disk.",
    check: "Permissions or disk on ~/.socadb/conversations.",
  },
  "chat.conversation.delete_failed": {
    level: "error",
    meaning: "Deleting a conversation's files failed.",
    check: "Permissions on ~/.socadb/conversations or the Claude session store.",
  },
  "chat.conversation.invalid": {
    level: "warn",
    meaning: "A conversation file doesn't parse and was skipped.",
    check: "A file in ~/.socadb/conversations with an old or broken shape.",
  },
  "chat.conversations.load_failed": {
    level: "error",
    meaning: "Loading the conversations failed as a whole.",
    check: "The message; the chat history appears empty.",
  },
  "chat.sessions.prune_failed": {
    level: "warn",
    meaning: "Removing Claude sessions of deleted conversations failed.",
    check: "Harmless leftovers in the session store; the message says why.",
  },
  "chat.provider.persist_failed": {
    level: "error",
    meaning: "The provider setting (login type) could not be written to config.json.",
    check: "A config.json that doesn't parse, or permissions.",
  },
  "chat.stream.parse_failed": {
    level: "error",
    meaning: "A line from the agent runner wasn't valid JSON.",
    check:
      "The runner printed something on stdout that isn't an event; see agent.stderr around it.",
  },
  "agent.init.failed": {
    level: "warn",
    meaning: "Preheating the agent runner failed; sending will report it again.",
    check: "Read the agent.spawn.* or keyring.* line just before.",
  },
  "agent.turn.error": {
    level: "warn",
    meaning: "The agent ended a turn with an error; msg is its raw text.",
    check:
      "ctx.code (auth, model_unavailable, memory_lost) and ctx.provider; read agent.stderr lines around it.",
  },
  "keyring.save.failed": {
    level: "error",
    meaning: "Writing an API key to the OS keychain failed.",
    check: "Denied or locked keychain, or no backend on Linux.",
  },
  "keyring.delete.failed": {
    level: "error",
    meaning: "Removing an API key from the OS keychain failed.",
    check: "Denied or locked keychain.",
  },
  "keyring.migration.failed": {
    level: "error",
    meaning: "Moving old plaintext keys into the keychain could not finish.",
    check:
      "The keys stay in config.json until it succeeds; check keyring.save.failed lines.",
  },
  "keyring.plaintext_clear.failed": {
    level: "error",
    meaning: "An old plaintext key could not be removed from config.json.",
    check: "Permissions or a config.json that doesn't parse.",
  },
  "mcp.tool": {
    level: "info",
    meaning: "An MCP action succeeded; msg is the action, ctx.ms its duration.",
    check: "Slow ms shows what made an agent turn slow; failures are mcp.tool.failed.",
  },
  "mcp.tool.failed": {
    level: "warn",
    meaning:
      "An MCP action returned an error to the agent; msg is the action, ctx.error the reason (names masked).",
    check:
      "Next to an agent.turn.error it explains what the agent hit; a validation error points at the tool schema in mcp-server/src/tools.",
  },
  "mcp.request.failed": {
    level: "error",
    meaning: "Handling an MCP request threw.",
    check: "The message and stack; the agent got an error reply.",
  },
  "mcp.respond.failed": {
    level: "error",
    meaning: "The reply to an MCP request could not be handed to the bridge.",
    check: "Usually the connection closed; see mcp.ws.* lines.",
  },
  "mcp.registration.binary_missing": {
    level: "error",
    meaning: "The MCP server binary was not found, so no AI app was registered.",
    check: "The bundle lacks socadb-mcp-*; in dev run `bun run build:mcp`.",
  },
  "mcp.registration.failed": {
    level: "warn",
    meaning: "Registering SocaDB with one AI app was skipped.",
    check:
      "ctx.client; its config file couldn't be read or written, and was left untouched.",
  },
  "mcp.registration.config_unreadable": {
    level: "warn",
    meaning: "An AI app's config file doesn't parse, so SocaDB won't touch it.",
    check: "ctx.client; Settings › Integrations shows it as unreadable.",
  },
  "mcp.integration.toggle_failed": {
    level: "error",
    meaning: "Turning an integration on or off failed.",
    check: "ctx.client and the message from the config write.",
  },
  "import.done": {
    level: "info",
    meaning:
      "An import finished; ctx has format, counts and whether it came from the home.",
    check: "Context for layout or editor errors that follow.",
  },
  "import.no_tables": {
    level: "warn",
    meaning: "The imported file had no table SocaDB could read.",
    check: "ctx.attempted counts statements tried; unsupported SQL dialect or syntax.",
  },
  "import.failed": {
    level: "error",
    meaning: "Import threw while reading or parsing the file.",
    check: "The message; ctx.format says which parser.",
  },
  "updater.available": {
    level: "info",
    meaning: "An update was found; msg is its version.",
    check: "Context for later updater lines.",
  },
  "updater.check.failed": {
    level: "error",
    meaning: "Checking or downloading an update failed (Tauri updater).",
    check: "The message: network, signature, or the update endpoint.",
  },
  "updater.sparkle.check_failed": {
    level: "error",
    meaning: "Sparkle's update check failed.",
    check: "The message; network or the appcast.",
  },
  "updater.sparkle.update_failed": {
    level: "error",
    meaning: "Sparkle failed to download or install an update.",
    check: "The message; signature or disk space.",
  },
  "updater.install.failed": {
    level: "error",
    meaning: "Installing the downloaded update failed.",
    check: "The message; permissions on the app location.",
  },
  "updater.install_on_launch.failed": {
    level: "error",
    meaning: "Installing the staged update at launch failed.",
    check:
      "The message; the app may be on a read-only volume (see app.start ctx.install).",
  },
  "mcp.server.start": {
    level: "info",
    meaning: "The MCP server binary connected to SocaDB and is serving tools.",
    check: "One per agent run or AI app session; ctx-free.",
  },
  "mcp.server.start_failed": {
    level: "error",
    meaning: "The MCP server binary could not start; the AI app sees no SocaDB tools.",
    check: "The message; usually mcp.server.app_not_running just before.",
  },
  "mcp.server.app_not_running": {
    level: "error",
    meaning: "The MCP server found no ~/.socadb/.port, so SocaDB wasn't running.",
    check:
      "Open SocaDB first; if it is open, look for mcp.port_file.write_failed in socadb.log.",
  },
  "mcp.server.port_invalid": {
    level: "error",
    meaning: "~/.socadb/.port holds no valid port.",
    check: "ctx.content; a half-written or foreign file.",
  },
  "mcp.server.connected": {
    level: "info",
    meaning: "The MCP server connected to SocaDB's bridge.",
    check: "ctx.port must match the app's mcp.ws.listening.",
  },
  "mcp.server.socket_error": {
    level: "error",
    meaning: "The MCP server's connection to SocaDB failed.",
    check: "The message; the app may have quit or the port may be stale.",
  },
  "mcp.server.disconnected": {
    level: "warn",
    meaning: "SocaDB closed the MCP connection.",
    check:
      "ctx.pending > 0 means tool calls were lost; the app probably quit or restarted.",
  },
  "mcp.server.request_timeout": {
    level: "warn",
    meaning: "SocaDB didn't answer an MCP tool call within 10 s.",
    check:
      "msg is the action; look for mcp.tool or ui.* errors in socadb.log at that time.",
  },
  "mcp.server.request_failed": {
    level: "warn",
    meaning: "SocaDB answered an MCP tool call with an error.",
    check: "ctx.action; the msg is what the agent saw.",
  },
} satisfies Record<string, LogCodeInfo>;

export type LogCode = keyof typeof LOG_CODES;
