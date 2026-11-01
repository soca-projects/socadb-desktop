# Contributing to SocaDB

Thanks for helping improve SocaDB.

## Ideas and bug reports

The most useful help is feedback: bugs, rough edges, missing features, and how you use SocaDB. Open an [issue](https://github.com/soca-projects/socadb-desktop/issues). For a bug, say what you did, what you expected, what happened, and which version and system you use. **Help › Show Logs** in the app opens the log folder; a few lines from it often explain the problem. For an idea, describe the need behind it as well as the solution. If you have a view on how it could be built, feel free to share it.

## Pull requests

Pull requests are welcome for bug fixes. For anything else, please open an issue first: the change may already be planned or under way, and agreeing on it first keeps your time from being wasted. Pull requests target the `develop` branch. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), one intent per commit, and each commit passes the checks below on its own.

By submitting a pull request, a patch or code in an issue, you grant SocaDB a perpetual, worldwide, royalty-free, irrevocable license to use, modify, sublicense and distribute your contribution as part of SocaDB, under any license. You keep the copyright of your contribution, and you confirm that you have the right to grant this license.

## Running SocaDB from source

You need [Bun](https://bun.sh) 1.3, the Rust toolchain pinned in `src-tauri/rust-toolchain.toml`, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your system. On Debian or Ubuntu, that means `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev` and `patchelf`.

```bash
bun install
(cd mcp-server && bun install)
./scripts/macos/download-sparkle.sh   # macOS only: the updater links against Sparkle
bun run build:mcp                      # the MCP server and agent runtime bundled with the app
bun run tauri dev
```

Rebuild with `bun run build:mcp` after changing anything in `mcp-server/`, since the app runs the compiled binary.

Before opening a pull request, run the same checks as CI:

```bash
bun run lint && bun run typecheck && bun run test && bun run format:check
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

## Project layout

| Path | Contents |
| --- | --- |
| `src/` | The interface: React, Vite, Tailwind CSS and Zustand |
| `src-tauri/` | The Tauri 2 shell in Rust: files, settings, agents and updates |
| `mcp-server/` | The MCP server and the agent runners, compiled with Bun into one binary |
| `scripts/` | Release, packaging and development tools |
