#!/usr/bin/env bash
# Downloads the pinned Sparkle.framework and its tools (sign_update…) into
# src-tauri/. Skips only when the installed copy came from this exact tarball,
# so bumping VERSION replaces a stale local install.

set -euo pipefail

VERSION="2.9.6"
EXPECTED_SHA="52bf9e88cdd972fc0c81501377a880e90d47031bd8ca5462488f843e2609e192"
URL="https://github.com/sparkle-project/Sparkle/releases/download/${VERSION}/Sparkle-${VERSION}.tar.xz"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEST="${REPO_ROOT}/src-tauri"
MARKER="${DEST}/sparkle-bin/.archive-sha256"

if [ -d "${DEST}/Sparkle.framework" ] && [ -x "${DEST}/sparkle-bin/sign_update" ] \
  && [ "$(cat "${MARKER}" 2>/dev/null)" = "${EXPECTED_SHA}" ]; then
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

framework_src="$(find "${tmp}/extract" -maxdepth 3 -type d -name "Sparkle.framework" | head -n1)"
if [ -z "${framework_src}" ]; then
  echo "ERROR: Sparkle.framework not found in tarball" >&2
  exit 1
fi

rm -rf "${DEST}/Sparkle.framework"
# cp -R keeps the framework's internal symlinks (Versions/Current…) as links.
cp -R "${framework_src}" "${DEST}/Sparkle.framework"

rm -rf "${DEST}/sparkle-bin"
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

printf '%s\n' "${EXPECTED_SHA}" > "${MARKER}"
echo "Sparkle ${VERSION} installed at ${DEST}/Sparkle.framework"
