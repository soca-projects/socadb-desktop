# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor version bumps may include breaking changes.

## [0.1.2](https://github.com/soca-projects/socadb-desktop/compare/v0.1.1...v0.1.2) (2026-05-15)


### Features

* **chat:** refresh model list to current generation ([90b263a](https://github.com/soca-projects/socadb-desktop/commit/90b263a1043e1a70cd519834cd7afe940bfec323))


### Bug Fixes

* **deps:** bump @openai/codex-sdk to 0.130.0 + refresh model list ([c7a7785](https://github.com/soca-projects/socadb-desktop/commit/c7a778506d1e890bd85a491d661969183f4d09bf))
* **deps:** bump @openai/codex-sdk to 0.130.0 to restore Codex on macOS ([3fcd77f](https://github.com/soca-projects/socadb-desktop/commit/3fcd77f642ea13121b1654b7f8fdac8ed1a0bb66))
* persist user config files reliably across platforms ([6628302](https://github.com/soca-projects/socadb-desktop/commit/662830249fcb467be15ac4ae41519d2f2fad47bd))
* persist user config files reliably across platforms ([f4c77fa](https://github.com/soca-projects/socadb-desktop/commit/f4c77faa07892b6ebfd35d8379d7e4e05e772a7f))
* **windows:** runtime blockers — terminals, shortcuts, toolbar path ([2f688f3](https://github.com/soca-projects/socadb-desktop/commit/2f688f3ee6847f5281eaeefcdaa0eab940d836cb))
* **windows:** split filename on both / and \\ separators in toolbar ([90f6168](https://github.com/soca-projects/socadb-desktop/commit/90f616897641c452837f89fa857c8fa50fba59ae))
* **windows:** suppress console flash from bun.exe and taskkill subprocesses ([ea6bea1](https://github.com/soca-projects/socadb-desktop/commit/ea6bea11f7d51da2d0283a164ddb50305336dff2))
* **windows:** wire menu accelerators via setAsWindowMenu and native conventions ([6564bfc](https://github.com/soca-projects/socadb-desktop/commit/6564bfc4bfc5420fb4149b7ef3d66ac1ddd83568))

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

[Unreleased]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/soca-projects/socadb-desktop/releases/tag/v0.1.0
