# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor version bumps may include breaking changes.

## [0.1.5](https://github.com/soca-projects/socadb-desktop/compare/v0.1.4...v0.1.5) (2026-10-20)


### Features

* add column type, enum and default helpers ([b086a60](https://github.com/soca-projects/socadb-desktop/commit/b086a606096d6b544d6d4c0ac34f8947e1890cb4))
* add enum and index actions to the schema store ([5c622cf](https://github.com/soca-projects/socadb-desktop/commit/5c622cf2c2bb8bece97d10d88376fa8eeafa49e3))
* add index naming, foreign key hint and index editing helpers ([e0bf078](https://github.com/soca-projects/socadb-desktop/commit/e0bf07844d00c3fb998522c187731a3cbfaa62d0))
* add notes, indexes, enums and type lengths to the schema model ([eae3cec](https://github.com/soca-projects/socadb-desktop/commit/eae3cece79f8e7943109a26ec7ce4ff26d834d25))
* add the table note and an Indexes tab to the side panel ([da9da33](https://github.com/soca-projects/socadb-desktop/commit/da9da3318997e8adee9274ded8c7706bf3df9878))
* add UNSIGNED to MySQL numeric columns ([cb8d5aa](https://github.com/soca-projects/socadb-desktop/commit/cb8d5aa1faf78df37bc81835e6037e1d692f8f86))
* build one schema file per imported file ([236d891](https://github.com/soca-projects/socadb-desktop/commit/236d8916acda7913b4159c897263cdae37a7fc36))
* carry enums through SQL and JSON imports ([63dc705](https://github.com/soca-projects/socadb-desktop/commit/63dc7058fb413e83b883836e029194848f6bd1c1))
* column editor with enums, lengths, defaults and notes ([c904348](https://github.com/soca-projects/socadb-desktop/commit/c90434819663ee238c81d1b8780ddaf829b3e467))
* copy notes, indexes and enums when duplicating a table ([0b454dc](https://github.com/soca-projects/socadb-desktop/commit/0b454dcfc6cbc0ecbf5ab7c50e3c3942ae789241))
* create schema files without overwriting ([cfe4ca8](https://github.com/soca-projects/socadb-desktop/commit/cfe4ca8cd76ba50ae4203909ef9e945e57af7188))
* detect MySQL and PostgreSQL from more SQL types ([5f7aaf6](https://github.com/soca-projects/socadb-desktop/commit/5f7aaf6ad317dec323eab69390b0f49c6177f3c0))
* detect the database of imported files more often ([31d8030](https://github.com/soca-projects/socadb-desktop/commit/31d8030d4b0b319f6a7724a1f4a7bd83b7052a7e))
* draw the empty states ([980862f](https://github.com/soca-projects/socadb-desktop/commit/980862f8178573bf15b27acf9ee65851255a5073))
* draw the empty states ([5db5e00](https://github.com/soca-projects/socadb-desktop/commit/5db5e003184ef7a0caebc5aeee01368e1b62c5c4))
* drop files on the home to import them ([f510b47](https://github.com/soca-projects/socadb-desktop/commit/f510b47e27db39b8fce33582a1aa72be9b081499))
* drop files on the home to import them ([f4a7c34](https://github.com/soca-projects/socadb-desktop/commit/f4a7c34ee8ec6d4f55cc377a56c3ce1dc38e67e1))
* edit columns in a one-line list with a column editor ([a7f9dce](https://github.com/soca-projects/socadb-desktop/commit/a7f9dcea5a15259b0f01c238d524e78087b2cff6))
* export enums, indexes, notes and type parameters to SQL ([5e7692a](https://github.com/soca-projects/socadb-desktop/commit/5e7692a66c22753261619c2cd5cde9770442d07e))
* export enums, indexes, notes and type parameters to SQL ([2996671](https://github.com/soca-projects/socadb-desktop/commit/299667108dee996348db675212c26905a2ac483a))
* give the app the website's paper look ([a8d2a54](https://github.com/soca-projects/socadb-desktop/commit/a8d2a54b26a62811a4f70f5347ea178af5b63a70))
* give the app the website's paper look ([3e0b149](https://github.com/soca-projects/socadb-desktop/commit/3e0b14917b86e37225e6fb965cb424f5a9fa4851))
* grey out columns an index can't use ([17368e5](https://github.com/soca-projects/socadb-desktop/commit/17368e5ace818f75657615e1edcb4ea6e7c5cef3))
* guess a DBML file's database from its types ([9eb7df0](https://github.com/soca-projects/socadb-desktop/commit/9eb7df02d397eeebc770a3cfc11b8ffd54711f48))
* import DBML files ([88aae30](https://github.com/soca-projects/socadb-desktop/commit/88aae30e374429760f22866030658131211d9901))
* import DBML files ([a57ca7d](https://github.com/soca-projects/socadb-desktop/commit/a57ca7d13c9a511608edcf628ea5024b7690dc1f))
* import enums, indexes, notes and pg_dump keys from SQL ([4af2dc0](https://github.com/soca-projects/socadb-desktop/commit/4af2dc0948e2eea970311ba62b4cfc4c0a5ad4f4))
* import enums, indexes, notes and pg_dump keys from SQL ([dbe6483](https://github.com/soca-projects/socadb-desktop/commit/dbe648341cb75c1dc4757fd56e451a97c5a664e5))
* import several files from the home ([5a35777](https://github.com/soca-projects/socadb-desktop/commit/5a3577727672879dcce20e360a4749f1ac973d8a))
* import several files from the home ([8e96657](https://github.com/soca-projects/socadb-desktop/commit/8e96657c22bcc924b8e86b519bd64e40de5e5ce4))
* keep enum links, indexes and type parameters consistent ([ae729c9](https://github.com/soca-projects/socadb-desktop/commit/ae729c9a63796f6079f062f1851e5b1701e0d45d))
* let the agent read and write notes, enums, indexes and type parameters ([1602dd5](https://github.com/soca-projects/socadb-desktop/commit/1602dd581f8b8eca5daea9d18a3ccb8cd9c2e911))
* let the agent read and write notes, enums, indexes and type parameters ([827512b](https://github.com/soca-projects/socadb-desktop/commit/827512b8eb58be44e83522a62d4423c80fdae93a))
* lighten the sticker on the home's New schema button ([701fe2c](https://github.com/soca-projects/socadb-desktop/commit/701fe2c063a3767c5382b431a1134656a7c89eb6))
* lighten the sticker on the home's New schema button ([6cf6bfa](https://github.com/soca-projects/socadb-desktop/commit/6cf6bfae44ed24f1d4370b9486132f90033737e7))
* list what a SQL import could not keep ([a71dc53](https://github.com/soca-projects/socadb-desktop/commit/a71dc534892fc5e6d4f12050399ec0c74c218d73))
* notes, enums and indexes on the canvas ([a396330](https://github.com/soca-projects/socadb-desktop/commit/a396330d192cee5909cbf2fa28e318439e06c357))
* parse DBML files ([a566a72](https://github.com/soca-projects/socadb-desktop/commit/a566a72b6d1549bfd9f5ba8ae92b96cf0e964888))
* schema model for notes, indexes, enums and type lengths ([e598985](https://github.com/soca-projects/socadb-desktop/commit/e59898528520bf8d05de9b00765a20707789b2ef))
* show each imported file's result ([111046f](https://github.com/soca-projects/socadb-desktop/commit/111046f47261d58c0aa37a9fc1dc41c248e1b4ee))
* show notes, enum values and indexes on canvas tables ([8a7aa73](https://github.com/soca-projects/socadb-desktop/commit/8a7aa739d48c45b977c7534cb225aa75ce599b9a))
* sign and notarize the macOS app with a Developer ID ([0741ab2](https://github.com/soca-projects/socadb-desktop/commit/0741ab23b519cb2fbd37b200e50bdbde762120f5))
* sign and notarize the macOS app with a Developer ID ([a31b4ff](https://github.com/soca-projects/socadb-desktop/commit/a31b4ff34c271f9f57150d00e5f1b35d324049fe))
* size tables and thumbnails for their index section ([c6298c1](https://github.com/soca-projects/socadb-desktop/commit/c6298c17584442826f257d984eb380bc39d2ced8))
* table notes and indexes in the side panel ([c39c3f3](https://github.com/soca-projects/socadb-desktop/commit/c39c3f335a20e2d290a9f0e239ed824dbdf977a6))
* tell the agent about notes, enums and indexes ([c0e7de2](https://github.com/soca-projects/socadb-desktop/commit/c0e7de2b4e50d51d62b9a2d5fc6dd06a757d37fb))
* tell value defaults from expression defaults ([f70bd6b](https://github.com/soca-projects/socadb-desktop/commit/f70bd6becca296f19a2a1901c287dec3c11fd237))


### Bug Fixes

* **deps:** update rustls to 0.23.46 ([e5d7654](https://github.com/soca-projects/socadb-desktop/commit/e5d7654684b942aa08651adf7b8ba581a9bed2c2))
* **deps:** update rustls to 0.23.46 ([f0326e7](https://github.com/soca-projects/socadb-desktop/commit/f0326e7a44ab5e541a09e99524e037abb66f11b0))
* keep a selected table's relations when pressing delete ([0bef475](https://github.com/soca-projects/socadb-desktop/commit/0bef47540d76e808a62632fd1a229ace7eb385f0))
* keep a selected table's relations when pressing delete ([56c478d](https://github.com/soca-projects/socadb-desktop/commit/56c478d7802830a4fbdd3bbb1d1bec966cb72542))
* keep empty text defaults through import and export ([b4d3c7b](https://github.com/soca-projects/socadb-desktop/commit/b4d3c7ba3dbbd402197feccefb136f6a0a49b108))
* keep notes, indexes and enums in JSON imports ([f9eb03b](https://github.com/soca-projects/socadb-desktop/commit/f9eb03b3689f0a1b4907323bbf8c8700776157c1))
* move an enum aside when a table takes its name ([00cb887](https://github.com/soca-projects/socadb-desktop/commit/00cb8874944ae34d632b5c7c73817c08aa62b6ab))
* open the app's own menu instead of the system dropdowns ([910845a](https://github.com/soca-projects/socadb-desktop/commit/910845a5882594a54a581a6399ecbb4c3b35d229))
* open the app's own menu instead of the system dropdowns ([d03e4f7](https://github.com/soca-projects/socadb-desktop/commit/d03e4f746754169812420a06462b7bdd1b96c699))
* read a composite key declared one column at a time ([c5660c6](https://github.com/soca-projects/socadb-desktop/commit/c5660c6c369fccb75a5779cebf8746e96d4bb8c0))
* read a composite key declared one column at a time ([42ffaff](https://github.com/soca-projects/socadb-desktop/commit/42ffaff7e17014dd2a043f2b3dfd9f74e743041c))
* save schemas opened from the home or restored at startup ([747c796](https://github.com/soca-projects/socadb-desktop/commit/747c79607b08c01b5a538174f44dd2ea09db885d))
* save schemas opened from the home or restored at startup ([ee5e6a1](https://github.com/soca-projects/socadb-desktop/commit/ee5e6a10b82f7b2bf85e6f3205cf3e0f10a4f0a3))
* validate enum links when a schema is loaded ([239a173](https://github.com/soca-projects/socadb-desktop/commit/239a1735eb645e24f6e5a0c8c751d73506b5fa92))

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
- **Claude 5 and GPT-6** in the model picker, with updated agent SDKs.
  (#77)

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
- **The MCP bridge refuses connections from web pages.** (#79)
- **Dark mode** styles and notifications follow the theme chosen in the
  app rather than the system's. (#86)
- **The window** can be dragged from the toolbar and closed from the
  menu. (#87)

## [0.1.3] - 2026-09-25

Updates no longer interrupt your work. SocaDB downloads new versions in
the background and asks once they are ready: restart and install now, or
install the next time you quit. On macOS, updates now go through Sparkle,
which installs from a separate helper, so quitting mid-install can no
longer leave a broken app. This release also restores Codex on macOS,
adds a reasoning effort picker to the chat, and fixes keyboard shortcuts
on Windows.

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

- **macOS updates go through Sparkle**. The update installs from a
  separate helper, so the app can quit at any time and the installation
  still completes. Users on 0.1.2 receive this version through the
  previous updater; Sparkle handles every update after it. (#66, #70)

### Fixed

- **Codex on macOS, again**. Apple revoked the certificate that signed
  the Codex CLI bundled in 0.1.2, and macOS blocked it at launch. The
  Codex SDK moves to 0.155.1, and the tools bundled with the app are now
  re-signed at build time, so a certificate revoked by a vendor can no
  longer keep SocaDB from opening. The Codex sign-in and sign-out
  commands shown in Settings are corrected. (#69, #66)
- **Keyboard shortcuts on Windows**. Menu shortcuts such as `Ctrl+S`,
  `Ctrl+O` and `Ctrl+Z` work again. (#64)
- **Claude Code install command on Windows**. Settings shows the
  PowerShell command instead of a bash one-liner that Windows cannot
  run. (#65)

## [0.1.2] - 2026-05-15

Windows actually works now. v0.1.1 published Windows binaries, but several
runtime bugs made the app unusable in practice — every spawned subprocess
flashed a console window, the menu shortcuts were dead, and the title bar
showed a broken file path. This release fixes those, ships a redesigned
app icon and installer, refreshes the AI model list to the current
generation, and restores Codex on macOS after Apple rotated their
developer certificates.

### Fixed

- **Windows runtime blockers**. Three issues that prevented Windows from
  being usable. Spawning the bundled Bun runtime or running `taskkill`
  flashed a console window for a frame on every call; the menu bar
  accelerators (`Ctrl+S`, `Ctrl+O`, undo / redo, etc.) were silently
  ignored because the native menu wasn't bound as the window's menu; and
  the toolbar's "current file" indicator only split paths on `/`, so on
  Windows you saw the full `C:\\Users\\...\\schema.soca` instead of just
  `schema.soca`.
- **Cross-platform config persistence**. Earlier builds wrote user config
  files to a malformed path (`${home}.socadb/` instead of `~/.socadb/`),
  so theme, language, API keys, and chat conversations didn't survive
  app restarts on certain setups. Persistence is now reliable on macOS,
  Windows, and Linux, and config writes are serialized to avoid races
  when multiple subsystems save at once.
- **Codex restored on macOS**. OpenAI rotated the developer certificates
  signing their Codex CLI on May 9, 2026 following a supply-chain
  incident in the npm ecosystem. v0.1.1's bundled SDK was still signed
  with the old certificate, which macOS XProtect started quarantining
  on launch. Bumping `@openai/codex-sdk` to 0.130.0 picks up the
  re-signed binary and Codex works again.

### Changed

- **AI models refreshed**. The chat picker now lists three current-
  generation models per provider: Claude Opus 4.7, Sonnet 4.6, Haiku
  4.5 from Anthropic; GPT 5.5, GPT 5.4, GPT 5.4 Mini from OpenAI. The
  old Claude 3 / GPT 4 family names are gone — they no longer match
  what the underlying CLI tools default to.
- **New app icon and Windows installer branding**. Replaced the
  placeholder icons with the redesigned SocaDB mark (rose + warm black
  on a soft beige rounded square). The Windows NSIS installer now uses
  the new icon for the `.exe`, the installer header, and the Start Menu
  shortcut, instead of the generic Tauri orange rainbow.

## [0.1.1] - 2026-05-04

The first release that actually works on every advertised platform. v0.1.0
only ran on macOS Apple Silicon — Linux, Windows, and Intel Mac downloads
were unusable. This release rebuilds the cross-platform pipeline, restores
the auto-update channel that was silently broken in v0.1.0, and aligns
every internal version field with the release tag.

### Fixed

- **Cross-platform installers**. Linux `.AppImage` was crashing during
  bundling because `linuxdeploy` ran `ldd` against the bundled Bun-compiled
  Claude Code runtime and aborted; Windows agent detection failed in
  production because the runner couldn't locate Bun on `PATH`; Intel Mac
  wasn't built at all. All four platforms now produce working installers.
- **Auto-update channel**. v0.1.0 silently shipped without `latest.json` or
  signature files because Tauri's `createUpdaterArtifacts` defaults to
  `false`. The configured updater endpoint returned 404 and no future
  release would have been picked up. From v0.1.1 onward, every release
  publishes a signed updater manifest for every platform, so installs will
  receive future updates automatically.

### Changed

- **Linux distribution simplified** to `.deb` (Ubuntu / Debian / Mint /
  Pop!_OS native install) and `.AppImage` (universal Linux). `.rpm` was
  costing ~33 minutes per release for marginal coverage and is dropped —
  Fedora and openSUSE users are covered by the AppImage.
- **Windows distribution simplified** to NSIS `.exe` only. `.msi` served
  only enterprise MDM deployments and added build complexity without
  addressing a real audience for now.

### Internal

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

- **Visual schema canvas**. Custom table nodes with inline column editing,
  drag-to-create relations with `ON DELETE` / `ON UPDATE` referential
  actions, and one-click auto-layout via Elkjs.
- **In-app AI chat**. A resizable chat panel (bottom-right) spawns your
  installed Claude Code CLI as a subprocess and pipes streamed responses
  back to the UI. Tool calls are visible on the canvas in real time as the
  agent edits the schema.
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
  dialogs (`Cmd+S` / `Cmd+O` / `Cmd+N` / `Cmd+Shift+S`). Auto-saves the
  current schema to `localStorage` between launches.
- **Polished native shell**. Native menu (File / Edit / View / Window)
  with shortcuts, undo / redo with 50-step history, light / dark theme,
  and English / French interface.

[0.1.3]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/soca-projects/socadb-desktop/releases/tag/v0.1.0
