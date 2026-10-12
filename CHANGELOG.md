# Changelog

All notable changes to SocaDB Desktop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor version bumps may include breaking changes.

## [0.1.4](https://github.com/soca-projects/socadb-desktop/compare/v0.1.3...v0.1.4) (2026-10-12)


### Features

* **agents:** keep Claude sessions in SocaDB's own store ([1c5aa44](https://github.com/soca-projects/socadb-desktop/commit/1c5aa44b6a323404a415b5b3856a59db48f3ea8b))
* **chat:** ask for the API key before sending when none is saved ([f0fbf59](https://github.com/soca-projects/socadb-desktop/commit/f0fbf59850ec6c287626ad3e0237ae71e4bce01d))
* **chat:** browse, search, rename and delete conversations ([506ad9b](https://github.com/soca-projects/socadb-desktop/commit/506ad9b1cff241177785cd3ad748258d7158c079))
* **chat:** conversation history, durable Claude sessions and one provider per conversation ([cacfe4e](https://github.com/soca-projects/socadb-desktop/commit/cacfe4ec1dcb05f0c1f27cdc05df232397d196d6))
* **chat:** explain auth failures with the step that fixes them ([6b4937c](https://github.com/soca-projects/socadb-desktop/commit/6b4937ca1df8d70bc6aff70e4ea302499303302f))
* **chat:** move the model and effort pickers under the input ([7278bf0](https://github.com/soca-projects/socadb-desktop/commit/7278bf0d903e6d5f2459d9f1b0ed13b2453dc183))
* **chat:** offer the Claude 5 and GPT-6 models ([a25b15b](https://github.com/soca-projects/socadb-desktop/commit/a25b15b108cdc42166be85ea76d763118b0fd849))
* **chat:** store each conversation in its own file ([e705457](https://github.com/soca-projects/socadb-desktop/commit/e7054570256f060fd685fa1aa98903f5926ebdb2))
* **devctl:** read the app's log with the meaning of each code ([f496466](https://github.com/soca-projects/socadb-desktop/commit/f4964665562502dba041b18bc1226aac4eff2409))
* **dev:** let an agent drive dev builds through the MCP bridge ([fe5f0e3](https://github.com/soca-projects/socadb-desktop/commit/fe5f0e3799b8ce7591297e61fef20828d3cc1130))
* **dev:** let an agent drive dev builds through the MCP bridge ([23a1b71](https://github.com/soca-projects/socadb-desktop/commit/23a1b71e0fd079fa70aa3995079321c52ba206c8))
* **files:** stat, rename and duplicate schema files from the app ([e525d12](https://github.com/soca-projects/socadb-desktop/commit/e525d1261b36b285c3c31f6b51bfb83574d31015))
* **home:** add the home screen and open it at launch, from the toolbar and the File menu ([a132dd0](https://github.com/soca-projects/socadb-desktop/commit/a132dd0e03cc7d0360096015d65e111a7c72925c))
* **home:** add the sorting, grouping and search rules of the home ([7a318d3](https://github.com/soca-projects/socadb-desktop/commit/7a318d312776d0d0687ea26e91d09bfb0d361e93))
* **home:** confirm the draft deletion in an app dialog ([27e8c8f](https://github.com/soca-projects/socadb-desktop/commit/27e8c8f5ebda5fe3f56f9b1768d321f0f8368f77))
* **home:** draw a miniature of a schema from its file ([2c1543a](https://github.com/soca-projects/socadb-desktop/commit/2c1543a628218320ac1606917ff38009dcf9c9a8))
* **home:** load recent schemas with their file details and add their actions ([273b8e6](https://github.com/soca-projects/socadb-desktop/commit/273b8e67b198f180e69eac0ea8841d8426b3a638))
* **home:** open on a home screen that lists your schemas with previews ([b42538a](https://github.com/soca-projects/socadb-desktop/commit/b42538a407334284aab2e4b449f5dc1dd59293ae))
* **logs:** keep a local log where every failure leaves a coded line ([3de337a](https://github.com/soca-projects/socadb-desktop/commit/3de337aca1fbc2e080574261b3b0661db0381dee))
* **logs:** log file, import, export, update and chat failures with stable codes ([572bf9a](https://github.com/soca-projects/socadb-desktop/commit/572bf9a9e631fd81e7589e4e1944c68df96bbd54))
* **logs:** log interface errors and the app's state at start, with a code catalogue ([3d7fe09](https://github.com/soca-projects/socadb-desktop/commit/3d7fe0929343164b5644007148e73124c415ce07))
* **logs:** open the log file from the Help menu ([7811065](https://github.com/soca-projects/socadb-desktop/commit/781106500ef12feb3a6f953ff369a2d599eb89a2))
* **logs:** record menu commands, navigation clicks and, in dev, shortcuts ([2c1cdd9](https://github.com/soca-projects/socadb-desktop/commit/2c1cdd9e926a4f45dc10337b94a6677663fe4208))
* **logs:** write one JSON line per event with a launch id, and log panics ([1965116](https://github.com/soca-projects/socadb-desktop/commit/1965116cbbd13d1a7d0e23db7b4cff1ae965658b))
* **macos:** install SocaDB into Applications when it can't update ([42dd597](https://github.com/soca-projects/socadb-desktop/commit/42dd59751f2c86a541c0f2222fe7f06cacf63193))
* **macos:** install SocaDB into Applications when it can't update ([0465cf2](https://github.com/soca-projects/socadb-desktop/commit/0465cf22f0275f4ce948f025f0583d1d1e44ee5f))
* **mcp:** log the MCP server's failures next to the app's log ([a751d22](https://github.com/soca-projects/socadb-desktop/commit/a751d22fab832dcddc8da3e4980049e1ad5ebe3c))
* **mcp:** register SocaDB with Codex and remember each app's choice ([0639d78](https://github.com/soca-projects/socadb-desktop/commit/0639d780d00dc7e0f90fd552619ce6f2c0505480))
* **recent:** remember up to 1000 schemas and let the UI subscribe ([595defc](https://github.com/soca-projects/socadb-desktop/commit/595defc4cb54264cd6becd0de19a22b462b83c8a))
* **settings:** add an Integrations section to choose the AI apps ([11149e0](https://github.com/soca-projects/socadb-desktop/commit/11149e03425088d9aa84a7f99fd85873c4afc358))
* **settings:** choose whether SocaDB opens on the home or the last schema ([a8fe5f2](https://github.com/soca-projects/socadb-desktop/commit/a8fe5f207a3247447d937c126757837d3fe04718))
* **settings:** choose which AI apps SocaDB registers with, and add Codex ([b433fdc](https://github.com/soca-projects/socadb-desktop/commit/b433fdcd832b927b9a6f364abf19f0c59a042ee3))
* **settings:** delete all conversations ([06fa633](https://github.com/soca-projects/socadb-desktop/commit/06fa633c01c91866f399156efe5a2c6767d08f5b))
* **settings:** widen the settings and give conversations their own tab ([47ed097](https://github.com/soca-projects/socadb-desktop/commit/47ed0977ae435d7c47da1f5895042037aa4980a5))
* **startup:** add the launch setting and restore the session before render ([7cea11f](https://github.com/soca-projects/socadb-desktop/commit/7cea11fe3a87cd7022f8e531fdeeae372e133ad9))
* **window:** fit narrow windows, steady the settings and fix theme details ([19fe837](https://github.com/soca-projects/socadb-desktop/commit/19fe837859f5858c5fe3b131e99f4fa4905b0f1b))
* **window:** fit the app in narrow windows ([8fe5e58](https://github.com/soca-projects/socadb-desktop/commit/8fe5e58f6a5ef50f3a52fe2dc9bd9452183b8680))


### Bug Fixes

* **agents:** end a stopped answer without an error ([1e2432e](https://github.com/soca-projects/socadb-desktop/commit/1e2432e59f7666406edb1656d051c2347c1611b9))
* **agents:** handle Codex errors and end stopped answers cleanly ([1ffb666](https://github.com/soca-projects/socadb-desktop/commit/1ffb66699dd22b9191d6ee86713ab373a6cda677))
* **agents:** handle Codex reconnects, lost threads and API errors ([97cb7df](https://github.com/soca-projects/socadb-desktop/commit/97cb7df85fba8d8be37eed6939ea5adacc5dffb0))
* **agents:** isolate the Claude agent from the user's Claude Code setup ([6bb82e1](https://github.com/soca-projects/socadb-desktop/commit/6bb82e10e3280610858afeb7d47bc5c6993e6f1b))
* **agents:** keep Claude session files private ([ffd258c](https://github.com/soca-projects/socadb-desktop/commit/ffd258c29faf351577c3697a94bc513ff5ace3a3))
* **agents:** limit the Claude agent to SocaDB tools and the web ([07bae26](https://github.com/soca-projects/socadb-desktop/commit/07bae26229869b6ba3516065ed542835f3e33728))
* **agents:** report a single auth error when Codex loses its login ([47ac1de](https://github.com/soca-projects/socadb-desktop/commit/47ac1de9b801546e0ae5b5dda8a50c81938340ed))
* **agents:** report auth failures at once, tagged as auth errors ([975021a](https://github.com/soca-projects/socadb-desktop/commit/975021adf3e820746dbb3adc99e9a61edd138a51))
* **agents:** run Codex without the user's config, shell or file access ([e20fb01](https://github.com/soca-projects/socadb-desktop/commit/e20fb01c1c10d469e56a65a4b1096742d200d8f2))
* **agents:** survive a torn or unloadable Claude session ([2d0a944](https://github.com/soca-projects/socadb-desktop/commit/2d0a944de03b6e906b7ca18986245f9db97be6c9))
* **agents:** take file and shell access away from both agents ([98f7b97](https://github.com/soca-projects/socadb-desktop/commit/98f7b97800fb1e5f425f443da969191caadf19d2))
* **agents:** turn off the Claude agent's auto-memory ([97a39be](https://github.com/soca-projects/socadb-desktop/commit/97a39becd635588ce8160a4c5be4b5acba0f422c))
* **chat:** don't keep a subscription agent when the keyring can't be read ([1f15cff](https://github.com/soca-projects/socadb-desktop/commit/1f15cff732efe673e5480e2a5ccdb715873a7f11))
* **chat:** keep inherited API keys away from keyless agents ([3c24612](https://github.com/soca-projects/socadb-desktop/commit/3c24612b55bdef6357b1e352577cba8b63dc02ff))
* **chat:** keep the conversation's session after an error ([25ab801](https://github.com/soca-projects/socadb-desktop/commit/25ab801961369f966981fa4db06bde6eb44f867a))
* **chat:** keep the history view mounted when the open conversation changes ([a7c866e](https://github.com/soca-projects/socadb-desktop/commit/a7c866ec309d505f60c6dc29292983aa9a6cb66d))
* **chat:** keep the lost-memory note in its own message ([5607fdf](https://github.com/soca-projects/socadb-desktop/commit/5607fdfb76b22281fc0da4dc03c5f3f9755f3e97))
* **chat:** keep the replacement agent when the old one exits ([f8db2f9](https://github.com/soca-projects/socadb-desktop/commit/f8db2f9dcbf1ecc888b35e5ad43b65a6bb215bff))
* **chat:** make the conversation history keyboard and screen reader friendly ([85299c8](https://github.com/soca-projects/socadb-desktop/commit/85299c83503e50c72cadb63d6ec4a0fda989f8e5))
* **chat:** never start a keyless agent in API key mode ([0bb8be4](https://github.com/soca-projects/socadb-desktop/commit/0bb8be4df34394b5b4c6f9eec317e62c690386fa))
* **chat:** open the chat on its latest messages ([fb8a80a](https://github.com/soca-projects/socadb-desktop/commit/fb8a80a89feb089bc767c313fa089babc9f16cb4))
* **chat:** pass the Codex API key as CODEX_API_KEY ([19ed99a](https://github.com/soca-projects/socadb-desktop/commit/19ed99adbe66c444a73254895c9086c04e7dbea3))
* **chat:** prune only SocaDB's copy of orphaned sessions ([aa85c53](https://github.com/soca-projects/socadb-desktop/commit/aa85c534550a25da8d5b9e548bd51730b297991e))
* **chat:** store API keys in the OS keychain ([7437b2a](https://github.com/soca-projects/socadb-desktop/commit/7437b2ac0a0a321c7e636f0c13c1be0f43a2d588))
* **chat:** tie each conversation to its provider and model ([3a88a02](https://github.com/soca-projects/socadb-desktop/commit/3a88a029ba37b864dcab42b3ffa85b97dbcb32b8))
* **ci:** make release-please create draft releases ([#73](https://github.com/soca-projects/socadb-desktop/issues/73)) ([890bccc](https://github.com/soca-projects/socadb-desktop/commit/890bccc19df181c70568424114db17ba6b6bd0eb))
* **config:** never add SocaDB back to an AI app after config.json was set aside, and keep every copy ([e8504f0](https://github.com/soca-projects/socadb-desktop/commit/e8504f089d3a4db0005367746fdf719fd4c5888a))
* **config:** set unreadable config.json and recent.json aside instead of losing or freezing settings ([0a42596](https://github.com/soca-projects/socadb-desktop/commit/0a42596058058e25a4795db7f19c4510b416f891))
* **config:** stop rewriting config.json or recent.json when they can't be read, and log it ([34e36df](https://github.com/soca-projects/socadb-desktop/commit/34e36df01f761c7741a7f5cd600bfa26bd976d6a))
* **devctl:** capture the visible app window ([f679267](https://github.com/soca-projects/socadb-desktop/commit/f6792678030411699632f0327c0d1b8b768e0076))
* **fs:** keep a file's permissions when replacing it atomically ([7f32635](https://github.com/soca-projects/socadb-desktop/commit/7f32635efd905e489532fc38901255b501c95863))
* **home:** highlight one card menu item at a time, without a focus ring ([b1f45eb](https://github.com/soca-projects/socadb-desktop/commit/b1f45eba152bc81ced399c720d1e3f859e32e5c0))
* **home:** mention a disconnected disk among the reasons a file is missing ([6eaee1f](https://github.com/soca-projects/socadb-desktop/commit/6eaee1f11791e2e51259eb1737c6deb3925f9c01))
* **home:** tell files SocaDB may not read apart from missing ones ([e0aa4f4](https://github.com/soca-projects/socadb-desktop/commit/e0aa4f4b350ab35c1c791937c42c38fec735ccbb))
* **home:** wait for the recents list before showing the empty home ([5d8385c](https://github.com/soca-projects/socadb-desktop/commit/5d8385cbf9c30ecc4a8885a443038c6dc9ecad99))
* **i18n:** translate the focus-mode hint and show shortcuts per platform ([7c216cf](https://github.com/soca-projects/socadb-desktop/commit/7c216cf3a89b4a386c3aac2040da509760e455d1))
* **logs:** cap each code to 20 lines a minute so a failure loop can't wipe the history ([21cb544](https://github.com/soca-projects/socadb-desktop/commit/21cb5445d075be99338371443d4105dad2a64f56))
* **logs:** count dropped lines before a stop or crash, and keep failed tool calls apart ([b0806c9](https://github.com/soca-projects/socadb-desktop/commit/b0806c95d17917a17a5630e98d26cd70950d81fe))
* **logs:** drop the log plugin's npm wrapper to avoid a vulnerable crate and a second Tauri API ([d675b69](https://github.com/soca-projects/socadb-desktop/commit/d675b6992dcffca2da039a54dc2f59a90e72efba))
* **logs:** keep file paths and agent output out of error lines ([c763462](https://github.com/soca-projects/socadb-desktop/commit/c763462b49bd1732e165b0b7d77554ad9ee8db4c))
* **logs:** keep tokens from other apps' configs out of the log ([a44078a](https://github.com/soca-projects/socadb-desktop/commit/a44078a8297d6b5895dc4c01c81bf69309e92099))
* **logs:** log where a file is rather than its name, and keep runner output out of release logs ([c8d4b19](https://github.com/soca-projects/socadb-desktop/commit/c8d4b190e6ebb1cdf3efa5ea4bc7a0d779d56bae))
* **logs:** mask escaped and single-quoted text, paths with spaces, and JSON parser quotes ([65dfd95](https://github.com/soca-projects/socadb-desktop/commit/65dfd957b7e787062d49c6ff7144ed7cb768170d))
* **logs:** match the log plugin's Rust and JS versions so tauri build accepts them ([aba2ae9](https://github.com/soca-projects/socadb-desktop/commit/aba2ae91023505da97f9213ac7e2e57891cb6697))
* **logs:** note the moment a code starts being dropped, and cap dependency warnings too ([865e866](https://github.com/soca-projects/socadb-desktop/commit/865e86600a150a5a046bacd82f8a540c8b542918))
* **logs:** record agent exits with their stderr, and MCP bridge failures ([37e54b6](https://github.com/soca-projects/socadb-desktop/commit/37e54b601f71be43b14733a9dfa9fa01e4f39625))
* **logs:** start the app even when its log can't be written ([adb3723](https://github.com/soca-projects/socadb-desktop/commit/adb37235f957cd0be34b26eaf1856dbab92b337f))
* **logs:** sum up validation errors on one line ([9eb8bc6](https://github.com/soca-projects/socadb-desktop/commit/9eb8bc679a0118b3b5d306b7b0ffbc6f906680c6))
* **mcp:** keep SocaDB's entry current in Claude Code and Claude Desktop ([027b4df](https://github.com/soca-projects/socadb-desktop/commit/027b4df467b8c7825b5edb4411d00734b0df8202))
* **mcp:** keep SocaDB's entry current in Claude Code and Claude Desktop ([4158e8d](https://github.com/soca-projects/socadb-desktop/commit/4158e8d23cdf574d554be954d784907da8be4c7f))
* **mcp:** refuse WebSocket handshakes coming from a browser ([3558ed6](https://github.com/soca-projects/socadb-desktop/commit/3558ed6268b9eaa1d2f4ae40acd5585ccbddf2fb))
* **mcp:** refuse WebSocket handshakes coming from a browser ([95d61ce](https://github.com/soca-projects/socadb-desktop/commit/95d61ce6db366a72a6d44d2acf8f9868f4939ad2))
* **recent:** save the recents list, which the fs scope kept from being written ([eb4af56](https://github.com/soca-projects/socadb-desktop/commit/eb4af56d8cf73ea4e6b9119895102a85f79676bd))
* **settings:** guard and name the delete-all confirmation ([e60fd1f](https://github.com/soca-projects/socadb-desktop/commit/e60fd1f449143b9fe4bf8d774bbc135907682475))
* **theme:** make dark styles and toasts follow the theme chosen in the app ([c682809](https://github.com/soca-projects/socadb-desktop/commit/c682809136b7f09fc7dbd72fdea5d317938390db))
* **toolbar:** center the window controls on the toolbar ([8c0d466](https://github.com/soca-projects/socadb-desktop/commit/8c0d46646db972e1103d9bb79ce92afaacb1f886))
* **ui:** give placeholders one color and fix two classes that did nothing ([b688fd6](https://github.com/soca-projects/socadb-desktop/commit/b688fd6eef241aa24a5f12de7f7bd5e68cf21ea7))
* **window:** let the toolbar drag the window and the menu close it ([bc0b3fc](https://github.com/soca-projects/socadb-desktop/commit/bc0b3fca3c0dec78b8f08b6e6d706fe6df4b8a8f))

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
