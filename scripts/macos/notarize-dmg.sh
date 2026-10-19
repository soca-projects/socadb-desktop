#!/usr/bin/env bash
# Tauri notarizes the app but not the disk image it ships in, and Gatekeeper can
# refuse to open a downloaded disk image that isn't notarized.

set -euo pipefail

DMG="${1:?usage: notarize-dmg.sh path/to/SocaDB.dmg tag}"
TAG="${2:?usage: notarize-dmg.sh path/to/SocaDB.dmg tag}"
: "${APPLE_API_KEY:?}" "${APPLE_API_ISSUER:?}" "${APPLE_API_KEY_PATH:?}" "${GH_TOKEN:?}" "${GITHUB_REPOSITORY:?}"

xcrun notarytool submit "${DMG}" --key "${APPLE_API_KEY_PATH}" --key-id "${APPLE_API_KEY}" \
  --issuer "${APPLE_API_ISSUER}" --wait --timeout 2h
xcrun stapler staple "${DMG}"
gh release upload "${TAG}" "${DMG}" --clobber --repo "${GITHUB_REPOSITORY}"
