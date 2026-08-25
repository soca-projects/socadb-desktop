#!/usr/bin/env bash
# Download Sparkle.framework + its bin/ tools into src-tauri/ so the macOS
# bundler can embed the framework and CI can sign + generate appcast.xml.
#
# Pinned to 2.8.1 with SHA256 verification — any tarball that doesn't match
# the recorded digest fails the build. Idempotent: if Sparkle.framework is
# already present, the download is skipped (lets the script run locally
# without re-pulling on every dev iteration).

set -euo pipefail

VERSION="2.8.1"
EXPECTED_SHA="5cddb7695674ef7704268f38eccaee80e3accbf19e61c1689efff5b6116d85be"
URL="https://github.com/sparkle-project/Sparkle/releases/download/${VERSION}/Sparkle-${VERSION}.tar.xz"

# Resolve repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEST="${REPO_ROOT}/src-tauri"

if [ -d "${DEST}/Sparkle.framework" ] && [ -x "${DEST}/sparkle-bin/sign_update" ]; then
  echo "Sparkle ${VERSION} already installed at ${DEST}/Sparkle.framework"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

echo "Downloading Sparkle ${VERSION}..."
curl -fsSL --retry 3 -o "${tmp}/sparkle.tar.xz" "${URL}"

echo "Verifying SHA256..."
actual="$(shasum -a 256 "${tmp}/sparkle.tar.xz" | awk '{print $1}')"
if [ "${actual}" != "${EXPECTED_SHA}" ]; then
  echo "ERROR: SHA256 mismatch for Sparkle ${VERSION}" >&2
  echo "  expected: ${EXPECTED_SHA}" >&2
  echo "  actual:   ${actual}" >&2
  exit 1
fi

echo "Extracting..."
mkdir -p "${tmp}/extract"
tar -xJf "${tmp}/sparkle.tar.xz" -C "${tmp}/extract"

# Locate Sparkle.framework inside the extracted tree — its position has
# moved across releases (sometimes at the root, sometimes under a versioned
# subdir), so we search rather than hardcode the path.
framework_src="$(find "${tmp}/extract" -maxdepth 3 -type d -name "Sparkle.framework" | head -n1)"
if [ -z "${framework_src}" ]; then
  echo "ERROR: Sparkle.framework not found in tarball" >&2
  exit 1
fi

rm -rf "${DEST}/Sparkle.framework"
# cp -R follows the framework's internal symlinks correctly.
cp -R "${framework_src}" "${DEST}/Sparkle.framework"

# Sparkle tools (sign_update et al.) live under bin/ in the tarball. CI uses
# sign_update for EdDSA signing and generate_appcast to produce the feed.
mkdir -p "${DEST}/sparkle-bin"
for tool in sign_update generate_keys generate_appcast BinaryDelta; do
  src="$(find "${tmp}/extract" -maxdepth 4 -type f -name "${tool}" | head -n1)"
  if [ -n "${src}" ]; then
    cp "${src}" "${DEST}/sparkle-bin/${tool}"
    chmod +x "${DEST}/sparkle-bin/${tool}"
  else
    echo "WARN: ${tool} not found in tarball — skipping" >&2
  fi
done

echo "Sparkle ${VERSION} installed at ${DEST}/Sparkle.framework"
