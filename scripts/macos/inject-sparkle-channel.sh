#!/usr/bin/env bash
# Inject a SUAllowedChannels entry into src-tauri/Info.plist for the given
# architecture. Run on each macOS build leg in CI so the resulting .app
# carries the right channel and Sparkle filters the appcast accordingly.
#
# Sparkle picks an item only if its <sparkle:channel> matches one of the
# values listed under SUAllowedChannels in the running app's Info.plist —
# this is how we serve arm64 / x64 from a single appcast feed without
# shipping a universal binary.
#
# Idempotent: if SUAllowedChannels is already set, it is overwritten with
# the value passed in.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <arm64|x64>" >&2
  exit 1
fi

channel="$1"
case "${channel}" in
  arm64|x64) ;;
  *)
    echo "ERROR: channel must be 'arm64' or 'x64', got '${channel}'" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PLIST="${REPO_ROOT}/src-tauri/Info.plist"

if [ ! -f "${PLIST}" ]; then
  echo "ERROR: Info.plist not found at ${PLIST}" >&2
  exit 1
fi

# PlistBuddy errors out if the key doesn't exist, so we delete-then-add to
# stay idempotent across re-runs (CI caching, local dev).
/usr/libexec/PlistBuddy -c "Delete :SUAllowedChannels" "${PLIST}" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :SUAllowedChannels array" "${PLIST}"
/usr/libexec/PlistBuddy -c "Add :SUAllowedChannels:0 string ${channel}" "${PLIST}"

echo "Injected SUAllowedChannels=[${channel}] into ${PLIST}"
