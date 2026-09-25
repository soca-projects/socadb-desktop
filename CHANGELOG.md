# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor version bumps may include breaking changes.

## [0.1.3](https://github.com/soca-projects/socadb-desktop/compare/v0.1.2...v0.1.3) (2026-09-25)


### Features

* **chat:** add per-model reasoning effort picker ([e6bac3a](https://github.com/soca-projects/socadb-desktop/commit/e6bac3a86614e7650b0f742f9de4818196b429d6))
* **chat:** add per-model reasoning effort picker ([a79f5a0](https://github.com/soca-projects/socadb-desktop/commit/a79f5a06e4929813884ecc242071217bcf0b1976))
* **updater:** route macOS updates through Sparkle ([#66](https://github.com/soca-projects/socadb-desktop/issues/66)) ([179d16f](https://github.com/soca-projects/socadb-desktop/commit/179d16faf1efad7611eb52233c7f79e28378f036))
* **updater:** show the update prompt in the app on macOS ([#70](https://github.com/soca-projects/socadb-desktop/issues/70)) ([36e9bde](https://github.com/soca-projects/socadb-desktop/commit/36e9bde83f4a39a7ca1cc9730553d4d9f3e3cb8a))
* **updater:** silent background download with non-dismissible install toast ([f605838](https://github.com/soca-projects/socadb-desktop/commit/f60583859355174b48e9d2e10952a4560845d8a9))
* **updater:** silent background download with non-dismissible install toast ([4e45b3b](https://github.com/soca-projects/socadb-desktop/commit/4e45b3b3d62b34905492a51462bed7efeedc18b2))


### Bug Fixes

* **chat:** bump codex to 0.155.1 to restore the OpenAI provider on macOS ([1a4872c](https://github.com/soca-projects/socadb-desktop/commit/1a4872c900a7d4f8656d0bf77daa326724b509a9))
* **chat:** restore the OpenAI provider on macOS ([d12a5e2](https://github.com/soca-projects/socadb-desktop/commit/d12a5e2576e1bc57d78aef15325a5f014110d39d))
* **chat:** show the real codex login and logout commands ([29dc345](https://github.com/soca-projects/socadb-desktop/commit/29dc34517813bf9a0c34146d2f03b52c0a3c261b))
* **platform:** guard navigator access for Node-environment tests ([7c54d93](https://github.com/soca-projects/socadb-desktop/commit/7c54d935749e8732dcd6d50dada4f6d8928fe617))
* **windows:** use PowerShell install command for Claude Code ([d66920d](https://github.com/soca-projects/socadb-desktop/commit/d66920d59f53813a8abe60ad25eee42192b68491))
* **windows:** use PowerShell install command for Claude Code ([161c060](https://github.com/soca-projects/socadb-desktop/commit/161c0601600246a8d86699a4b57ee15134c1a4e8))
* **windows:** wire keyboard shortcuts via JS keydown fallback ([950e794](https://github.com/soca-projects/socadb-desktop/commit/950e7944e6bf1a55af2e81682e9bdb0d1bf8f653))
* **windows:** wire keyboard shortcuts via JS keydown fallback ([8b3b8bb](https://github.com/soca-projects/socadb-desktop/commit/8b3b8bbdd0838a6e2a0e1a5235d118dcb128e1df))

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

[0.1.2]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/soca-projects/socadb-desktop/releases/tag/v0.1.0
