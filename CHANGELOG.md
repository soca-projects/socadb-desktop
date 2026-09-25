# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor version bumps may include breaking changes.

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
