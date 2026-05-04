# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until 1.0.0, minor version bumps may include breaking changes.

## [Unreleased]

## [0.1.1] - 2026-05-04

### Fixed

- Cross-platform builds now produce working installers on every supported
  platform. Previous v0.1.0 release shipped a usable build only on macOS arm64;
  Linux AppImage crashed during bundling, Windows agent detection failed in
  production, and Intel Mac was not built at all.
- Auto-update channel. v0.1.0 publish silently skipped `latest.json` and
  signature files, so the Tauri updater endpoint returned 404 and no future
  release would have been picked up. v0.1.1 publishes a signed updater
  manifest for every platform, so installs from this version forward will
  receive future updates automatically.

### Changed

- Linux distribution targets reduced to `.deb` (Ubuntu/Debian/Mint/Pop!_OS
  native install) and `.AppImage` (universal Linux). `.rpm` was producing a
  ~33-minute compression step in CI for marginal coverage and is dropped;
  Fedora/openSUSE users are covered by the AppImage.
- Windows distribution simplified to NSIS `.exe` only. `.msi` was unused
  and added build complexity without addressing a real audience.

### Internal

- Vendored a patched `linuxdeploy-plugin-gtk.sh` under `scripts/linux/` to
  work around linuxdeploy crashing when it runs `ldd` against Bun-compiled
  single-file binaries (the bundled Claude Code agent SDK runtime). The CI
  release workflow installs this script into `~/.cache/tauri/` before
  running `tauri build`.
- Bumped Tauri config, Rust crate, root `package.json`, and `mcp-server`
  package version to 0.1.1 so binary metadata and asset filenames match
  the release tag.

## [0.1.0] - 2026-04-29

Initial public release. Database schema designer with native AI CLI
integration via MCP. macOS arm64 only in practice; other platforms were
published but not functional and have been replaced by 0.1.1.

[Unreleased]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/soca-projects/socadb-desktop/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/soca-projects/socadb-desktop/releases/tag/v0.1.0
