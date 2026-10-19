#!/usr/bin/env bash
# Sparkle ships these helpers ad hoc and Tauri only re-signs the framework's
# XPC services: without this step, run before `tauri build`, the notary
# service rejects the app.

set -euo pipefail

: "${APPLE_SIGNING_IDENTITY:?}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK="$(cd "${SCRIPT_DIR}/../.." && pwd)/src-tauri/Sparkle.framework/Versions/Current"

for helper in Autoupdate Updater.app; do
  codesign --force --sign "${APPLE_SIGNING_IDENTITY}" --options runtime --timestamp "${FRAMEWORK}/${helper}"
  codesign --verify --strict "${FRAMEWORK}/${helper}"
done
