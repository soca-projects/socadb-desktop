# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor version bumps may include breaking changes.

## [0.1.6] - 2026-11-01

SocaDB now behaves like a desktop app: it remembers its window, opens
`.soca` files with a double-click, and has new Settings for the appearance,
the primary key of new tables and updates. AI apps reach SocaDB whenever it
opens, and can open or create schemas from its home. The AppImage's agents
work at last, Windows updates no longer stop when an AI app is open, and
undo can no longer bring another schema into the file you have open.

### Added

- **Double-click a `.soca` file** to open it, from the Finder, Explorer or
  a file manager. Several files at once join the home, and on macOS the
  files carry SocaDB's icon. On Linux this needs the .deb. (#152)
- **Appearance**. Settings chooses System, Light or Dark, and System
  follows the OS as it changes. The View menu keeps Toggle Theme. (#150)
- **The window remembers its size and position**. On macOS it never reopens
  in full screen. (#150)
- **Primary key of new tables**. Settings › General chooses it per
  database: UUID, integer or big integer. The agents follow it too. (#153)
- **Update settings**. Settings › Updates has Check automatically and
  Install automatically, both on by default, the installed version and a
  Check now button. With automatic install off, SocaDB asks first and
  downloads nothing before a click. (#154)
- **What's new**. From the next update on, a toast offers the new version's
  notes in the app's language. Settings › Updates › Release notes opens the
  whole history, and the update toast's link opens the notes of the
  incoming version. (#155, #156)
- **Third-party licenses**. Help › Third-Party Licenses lists the code
  SocaDB ships with and its licenses. (#158, #159)
- **About and Window menu**. About SocaDB opens the standard panel on macOS
  and a dialog on Windows and Linux. The macOS Window menu has Minimize,
  Zoom and Bring All to Front, and ⌘, (Ctrl+, on Windows and Linux) opens
  Settings. (#150)
- **AI apps can open and create schemas**. From the home, Claude Code,
  Claude Desktop and Codex can list your schemas, open one by name or
  create a new one. They no longer read or change the schema hidden behind
  the home. (#144)

### Changed

- **Settings** are rebuilt, with one row per setting in a dialog that keeps
  its size between sections. (#151)
- **New tables** land on the free spot nearest the middle of the view,
  never under the chat, instead of piling up in a diagonal. (#141)
- **Large schemas** are much faster to edit: a change no longer redraws
  every table and the side panel. (#139)
- **A smaller app**. It takes about 130 MB less on macOS, around 600 MB
  installed, and less on Windows and Linux too. (#129, #130)
- **Updates** behave the same on macOS, Windows and Linux, and SocaDB
  checks at launch and every four hours. On Windows the installer runs
  silently. On Linux, .deb installs offer Restart & install only, because
  they ask for an administrator password. (#154)
- **The interface feels native**. It no longer selects as text, shows a
  hand cursor on buttons or lets images and links be dragged out, and the
  page menu with Reload is gone. Fields, toasts and chat messages stay
  selectable. (#150)
- **System texts follow the system language** on macOS: WebKit's menus,
  file dialogs and the standard menu items. (#150)
- **A selection box** (Shift+drag) pans the view when it nears the canvas
  edge. (#135)

### Fixed

- **Undo after opening another schema** could show that schema's content
  under the open file, and saving wrote it there. Opening, creating or
  importing a schema now clears the undo history. (#149)
- **⌘Z in a text field** undoes the typing, not the schema. (#150)
- **Delete or Backspace** no longer removes the selected relation behind an
  open dialog. (#150)
- **Moving tables**. Dragging several tables saves them all, and moves with
  the arrow keys are saved, with each burst counting as one undo step.
  (#136)
- **The first table of an empty schema** no longer zooms the view to 200%.
  (#136)
- **AI apps reach SocaDB whenever it opens**. An app started while SocaDB
  was closed used to show Connection closed and never retry. (#144)
- **Claude Desktop** keeps SocaDB when it is added while Claude is open,
  and SocaDB finds the config of its Microsoft Store build. (#145)
- **One stuck AI app** no longer blocks the others or the chat. (#134)
- **The AppImage**. Its agents work, and AI apps keep a server path that
  survives closing SocaDB. (#146)
- **Windows updates** no longer stop on a file in use when an AI app or a
  leftover agent is running, and uninstalling leaves no folder behind.
  (#147)
- **An expired Claude login** shows the sign-in step instead of a generic
  error. (#128)
- **A macOS crash** when dragging a Mail attachment or a Photos image over
  the window. (#131)

### Internal

- Dependencies caught up: Tauri 2.12, React 19.3, Rust 1.99.1, Bun 1.3.14,
  React Flow 12.12, the Claude Agent SDK and the Rust crates, which clears
  several advisories. (#67, #119, #127, #128, #131, #132, #133, #135, #137,
  #138, #140, #142, #143, #148)
- Renovate opens every update on approval, and security fixes skip it.
  (#121)
- The source code is under PolyForm Shield 1.0.0, with a README and a
  contributing guide. (#157)
- CI starts both agents for real, tests the Windows installer end to end,
  and checks what the AppImage and the .deb ship. (#143, #144, #146, #147,
  #159)
- Dev builds drop the dependencies' debug info. (#120)

## [0.1.5] - 2026-10-20

Schemas now carry what a real database needs: notes on tables and
columns, enums, indexes and type parameters such as lengths and
precision. They show on the canvas, go into the exported SQL, come back
from SQL dumps, and the agents can read and write them. Import takes
DBML files and several files at once, picked from the home or dropped on
it. The app takes the website's paper look, and on macOS it is now
signed with a Developer ID and notarized, so it opens without a security
warning.

### Added

- **Notes, enums, indexes and type parameters**. Tables and columns take
  notes, columns take enums, lengths, precision and scale, MySQL numeric
  columns take UNSIGNED, and tables take indexes. Older files open
  unchanged. (#94)
- **Column editor**. Columns are listed one per line, and an editor sets
  the type, enum values, length, default and note. A default is either a
  value or an expression. (#96)
- **Table note and Indexes tab** in the side panel, with index naming, a
  hint for foreign keys without an index, and the columns an index can't
  use greyed out. (#97)
- **On the canvas**, tables show their notes, enum values and indexes.
  (#100)
- **SQL export** writes enums, indexes, notes and type parameters. (#101)
- **SQL import** keeps enums, indexes, notes and the keys pg_dump declares
  separately, and lists what it couldn't keep. (#102)
- **The agents** read and write notes, enums, indexes and type parameters.
  (#103)
- **DBML import**. (#104)
- **Several files at once**. The home imports several SQL, DBML or JSON
  files in one go, one schema file each, without overwriting existing
  files, and shows each file's result. Files can also be dropped on the
  home. (#106, #107)

### Changed

- **The paper look**. Warm paper and objects, a sticker on the actions
  where you start, and a marker band on the open table, in light and
  dark. The home's New schema button wears a lighter sticker. (#109,
  #115)
- **Drawn empty states** on the home, the canvas and the side panel.
  (#111)
- **The app's own menus** replace the system dropdowns for the sort
  order, the chat model and the agent login type. (#112)
- **The database of an imported file** is detected from more SQL types,
  and a DBML file's from its types. (#105)
- **Signed with a Developer ID and notarized** (macOS). The app and its
  disk image pass Gatekeeper, so macOS no longer warns on first launch.
  API-key users are asked for keychain access one last time after this
  update. (#114)

### Fixed

- **Schemas opened from the home or restored at startup** save again.
  (#95)
- **Pressing Delete with a table selected** no longer removes its
  relations. (#113)
- **A composite primary key declared one column at a time** is read
  correctly. (#108)

### Internal

- Project conventions are linted in TypeScript and Rust. (#98)
- rustls is updated for its advisories, and the zip advisories are
  ignored until the updater ships zip 9. (#99, #110)

## [0.1.4] - 2026-10-12

SocaDB now opens on a home screen with every schema you have worked on,
keeps each chat conversation so you can come back to it, and writes a
local log so problems can be diagnosed instead of guessed. API keys move
to the system keychain, the agents lose access to your files and shell,
and on macOS SocaDB offers to install itself into Applications when it
runs from the disk image.

### Added

- **Home screen**. Lists the schemas you have opened, created or saved,
  each with a miniature, with search, sorting, and actions to rename,
  duplicate, show in Finder or delete a draft. Settings › General
  chooses whether SocaDB opens on it or on the last schema. (#87)
- **Conversation history**. Each conversation is kept in its own file.
  Browse, search, rename or delete them from the chat, or delete them
  all from Settings › Conversations. A conversation keeps the provider
  and model it was started with. (#81)
- **Integrations settings**. Choose which AI apps SocaDB registers with
  as an MCP server: Claude Code, Claude Desktop and, new, Codex. (#85)
- **Install into Applications** (macOS). When SocaDB runs from the disk
  image or another place it can't update itself, it offers to move into
  Applications in one click. (#84)
- **Local log**. Failures are written to a log file in the system's log
  folder, opened from Help › Show Logs. It never contains schema
  contents, chat text or API keys, and nothing leaves your computer.
  (#88)
- **Claude 5 and GPT-6** in the model picker. (#77)

### Changed

- **API keys are stored in the system keychain** instead of the
  settings file. The chat asks for a key before sending when none is
  saved. (#76)
- **Sign-in problems are explained on the first message**, with the
  step that fixes them. (#76)
- **The model and effort pickers sit under the message box.** (#81)
- **The agents only work through SocaDB.** Neither can read your files
  or run shell commands, and the Claude agent no longer picks up your
  own Claude Code setup. (#77, #83)
- **Narrow windows and wider settings.** The app fits smaller windows,
  and conversations get their own settings tab. (#86)

### Fixed

- **Settings and recent schemas are no longer lost** when `config.json`
  or `recent.json` can't be read or doesn't parse. The file is set
  aside, so its content can still be recovered, and SocaDB never adds
  itself back to an AI app you had turned off. (#88)
- **The list of recent schemas is saved again.** A file permission kept
  it from being written. (#87)
- **Codex** recovers from reconnects, lost threads and API errors.
  (#82)
- **Stopping an answer** no longer shows an error. (#82)
- **Claude Code and Claude Desktop** keep SocaDB's entry up to date.
  (#78)
- **Web pages can no longer connect to SocaDB.** The local bridge the AI
  apps use refuses them. (#79)
- **Dark mode** styles and notifications follow the theme chosen in the
  app rather than the system's. (#86)
- **The window** can be dragged from the toolbar and closed from the
  menu. (#87)

### Internal

- The agent SDKs are updated. (#77)

## [0.1.3] - 2026-09-25

Updates no longer interrupt your work. SocaDB downloads new versions in
the background and asks once they are ready: restart and install now, or
install the next time you quit. On macOS, updates now install from a
separate helper, so quitting mid-install can no longer leave a broken
app. This release also restores Codex on macOS, adds a reasoning effort
picker to the chat, and fixes keyboard shortcuts on Windows.

### Added

- **Background updates with an install prompt**. Updates download while
  you work. Once the new version is ready, a prompt offers to restart and
  install now or to install the next time you quit. (#58, #70)
- **Check for Updates menu entry**. In the SocaDB menu on macOS and in a
  new Help menu on Windows and Linux. It follows the update as it
  downloads, turns into "Restart & install" once the update is ready, and
  tells you when SocaDB is already up to date. (#70)
- **Reasoning effort picker**. Pick low through max next to the model
  selector. The choice is remembered per provider, and the picker only
  offers the levels the selected model supports. (#60)

### Changed

- **Safer updates on macOS**. The update installs from a separate
  helper, so the app can quit at any time and the installation still
  completes. (#66, #70)

### Fixed

- **Codex on macOS, again**. Apple revoked the certificate that signed
  the Codex CLI bundled in 0.1.2, and macOS blocked it at launch. Codex
  works again, and a certificate revoked by a vendor can no longer keep
  SocaDB from opening. The Codex sign-in and sign-out commands shown in
  Settings are corrected. (#69, #66)
- **Keyboard shortcuts on Windows**. Menu shortcuts such as `Ctrl+S`,
  `Ctrl+O` and `Ctrl+Z` work again. (#64)
- **Claude Code install command on Windows**. Settings shows the
  PowerShell command instead of a bash one-liner that Windows cannot
  run. (#65)

### Internal

- macOS updates go through Sparkle. Users on 0.1.2 receive this version
  through the previous updater; Sparkle handles every update after it.
  (#66, #70)
- The Codex SDK moves to 0.155.1, and the tools bundled with the app are
  re-signed at build time. (#69, #66)

## [0.1.2] - 2026-05-15

Windows actually works now. v0.1.1 published Windows binaries, but several
bugs made the app unusable in practice: a console window kept flashing,
the menu shortcuts were dead, and the title bar showed a broken file path.
This release fixes those, ships a redesigned app icon and installer,
refreshes the AI model list to the current generation, and restores Codex
on macOS.

### Fixed

- **Windows works**. No more console window flashing, the menu shortcuts
  (`Ctrl+S`, `Ctrl+O`, undo / redo…) respond, and the toolbar shows the
  file name instead of its full path.
- **Settings survive a restart on every system**. Theme, language, API
  keys and chat conversations were lost after a restart on some setups.
- **Codex works again on macOS**. macOS had started blocking the Codex
  CLI after OpenAI changed the certificates that sign it.

### Changed

- **AI models refreshed**. The chat picker now lists three
  current-generation models per provider: Claude Opus 4.7, Sonnet 4.6,
  Haiku 4.5 from Anthropic; GPT 5.5, GPT 5.4, GPT 5.4 Mini from OpenAI.
  The old Claude 3 / GPT 4 family names are gone.
- **New app icon**. The redesigned SocaDB mark replaces the placeholder
  icons, including on the Windows installer and the Start Menu shortcut.

### Internal

- On Windows, spawning the bundled Bun runtime or `taskkill` no longer
  opens a console window, the native menu is bound to the window so its
  accelerators fire, and the toolbar splits paths on both separators.
- Config files were written to a malformed path (`${home}.socadb/`
  instead of `~/.socadb/`); config writes are now serialized.
- `@openai/codex-sdk` moves to 0.130.0, whose CLI is signed with OpenAI's
  new certificate after the May 9, 2026 rotation.

## [0.1.1] - 2026-05-04

The first release that actually works on every advertised platform. v0.1.0
only ran on macOS Apple Silicon: Linux, Windows, and Intel Mac downloads
were unusable. This release makes every download work and restores
automatic updates, which were silently broken in v0.1.0.

### Fixed

- **Installers for every platform**. The Linux, Windows and Intel Mac
  downloads now work.
- **Automatic updates**. v0.1.0 could not find any update. From 0.1.1 on,
  every install receives new versions automatically.

### Changed

- **Linux downloads** are a `.deb` (Ubuntu, Debian, Mint, Pop!_OS) and an
  `.AppImage` for every other distribution, including Fedora and
  openSUSE. The `.rpm` is dropped.
- **Windows downloads** are a single `.exe` installer. The `.msi` is
  dropped.

### Internal

- The AppImage bundling no longer aborts on the bundled Bun-compiled
  Claude Code runtime, agent detection on Windows finds Bun without
  `PATH`, and Intel Macs are built.
- v0.1.0 shipped without `latest.json` or signatures because Tauri's
  `createUpdaterArtifacts` defaults to `false`; every release now
  publishes a signed updater manifest for every platform.
- The `.rpm` cost about 33 minutes per release, and the `.msi` only
  served enterprise deployments.
- Vendored a patched `linuxdeploy-plugin-gtk.sh` under `scripts/linux/` to
  work around `linuxdeploy` crashing on Bun-compiled single-file binaries.
  The release workflow installs it into `~/.cache/tauri/` before running
  `tauri build`.
- GitHub release notes are now sourced automatically from this
  `CHANGELOG.md` — each release ships with the matching version section
  plus a permanent install instructions block.
- Bumped Tauri config, Rust crate, root `package.json`, and
  `mcp-server/package.json` to 0.1.1 so binary metadata, the about dialog,
  and asset filenames all line up with the release tag.

## [0.1.0] - 2026-04-29

The first public release. SocaDB is a native database schema designer that
pairs a visual canvas with the AI CLI you already have installed — chat
with Claude Code, watch it edit the canvas live, and export to SQL when
you're done.

In practice this version only ran on macOS Apple Silicon. Linux, Windows,
and Intel Mac builds were published but were not functional and have been
replaced by 0.1.1.

### Added

- **Visual schema canvas**. Tables with inline column editing,
  drag-to-create relations with `ON DELETE` / `ON UPDATE` referential
  actions, and one-click auto-layout.
- **In-app AI chat**. A resizable chat panel (bottom-right) talks to the
  Claude Code you have installed, and its changes show on the canvas as
  the agent edits the schema.
- **Bundled MCP server**. Auto-registered with Claude Code and Claude
  Desktop on first launch so your CLI knows about the open schema without
  any manual setup. Read tools (`get_schema`, `get_table`,
  `get_editor_state`) and write tools (`create_table`, `update_column`,
  `create_relation`, `auto_layout`, and more).
- **Authentication options**. Sign in via your Claude Code subscription
  (the CLI manages auth — your token never enters the app) or via an
  Anthropic API key stored in the OS Keychain. One slot active at a time.
- **Import / export**. Parse SQL DDL from MySQL or PostgreSQL into a
  working schema (with foreign-key resolution), and export back to SQL
  DDL, JSON, PNG, or SVG.
- **`.soca` file format**. Save and open schemas as JSON via native
  dialogs (`Cmd+S` / `Cmd+O` / `Cmd+N` / `Cmd+Shift+S`). The current
  schema is kept between launches.
- **Polished native shell**. Native menu (File / Edit / View / Window)
  with shortcuts, undo / redo with 50-step history, light / dark theme,
  and English / French interface.

[0.1.3]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/soca-projects/socadb-desktop/releases/tag/v0.1.0
