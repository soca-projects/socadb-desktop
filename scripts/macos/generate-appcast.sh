#!/usr/bin/env bash
# Generate Sparkle appcast.xml for a SocaDB release. Signs each macOS
# .app.tar.gz with the EdDSA private key piped on stdin (no on-disk key
# material) and emits a 2-item appcast — one per arch — tagged with
# <sparkle:channel> so each running binary only picks up its own update.
#
# usage:
#   echo "$EDDSA_PRIVATE_KEY" | generate-appcast.sh \
#     <version> <tag> <arm64-artifact> <x64-artifact> > appcast.xml
#
# Example: ... 0.1.3 v0.1.3 ./SocaDB_aarch64.app.tar.gz ./SocaDB_x64.app.tar.gz

set -euo pipefail

if [ $# -ne 4 ]; then
  echo "usage: $0 <version> <tag> <arm64-artifact> <x64-artifact>" >&2
  echo "  EdDSA private key read from stdin" >&2
  exit 1
fi

VERSION="$1"
TAG="$2"
ARM64_ARTIFACT="$3"
X64_ARTIFACT="$4"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SIGN_UPDATE="${REPO_ROOT}/src-tauri/sparkle-bin/sign_update"

if [ ! -x "${SIGN_UPDATE}" ]; then
  echo "ERROR: ${SIGN_UPDATE} missing — run scripts/macos/download-sparkle.sh first" >&2
  exit 1
fi

for f in "${ARM64_ARTIFACT}" "${X64_ARTIFACT}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: artifact not found: $f" >&2
    exit 1
  fi
done

# Buffer the key from stdin once — sign_update is called twice (one per
# artifact) and we don't want to ask the caller to pipe it twice.
KEY="$(cat)"
if [ -z "${KEY}" ]; then
  echo "ERROR: EdDSA private key not supplied on stdin" >&2
  exit 1
fi

# sign_update prints something like:
#   sparkle:edSignature="abc..." length="1234567"
# Parse both attributes back out so we can interpolate them into our XML.
sign_artifact() {
  local artifact="$1"
  local output
  output="$(printf '%s' "${KEY}" | "${SIGN_UPDATE}" -f - "${artifact}")"
  local sig length
  sig="$(printf '%s' "${output}" | sed -n 's/.*sparkle:edSignature="\([^"]*\)".*/\1/p')"
  length="$(printf '%s' "${output}" | sed -n 's/.*length="\([^"]*\)".*/\1/p')"
  if [ -z "${sig}" ] || [ -z "${length}" ]; then
    echo "ERROR: failed to parse sign_update output for ${artifact}: ${output}" >&2
    return 1
  fi
  printf '%s|%s' "${sig}" "${length}"
}

arm64_meta="$(sign_artifact "${ARM64_ARTIFACT}")"
x64_meta="$(sign_artifact "${X64_ARTIFACT}")"

ARM64_SIG="${arm64_meta%|*}"
ARM64_LEN="${arm64_meta#*|}"
X64_SIG="${x64_meta%|*}"
X64_LEN="${x64_meta#*|}"

# RFC 822 date (Sparkle is permissive but expects something parseable).
PUB_DATE="$(date -u '+%a, %d %b %Y %H:%M:%S +0000')"

# Enclosure URLs follow tauri-action's per-arch naming convention observed
# on past releases (SocaDB_aarch64.app.tar.gz / SocaDB_x64.app.tar.gz). If
# this convention ever drifts, the appcast job's `gh release download` finds
# no matching asset and fails the release before an appcast pointing at 404s
# can be published.
ARM64_URL="https://github.com/soca-projects/socadb-desktop/releases/download/${TAG}/SocaDB_aarch64.app.tar.gz"
X64_URL="https://github.com/soca-projects/socadb-desktop/releases/download/${TAG}/SocaDB_x64.app.tar.gz"

cat <<EOF
<?xml version="1.0" standalone="yes"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>SocaDB</title>
    <link>https://github.com/soca-projects/socadb-desktop</link>
    <description>SocaDB desktop app updates</description>
    <language>en</language>
    <item>
      <title>${VERSION}</title>
      <sparkle:version>${VERSION}</sparkle:version>
      <sparkle:shortVersionString>${VERSION}</sparkle:shortVersionString>
      <sparkle:channel>arm64</sparkle:channel>
      <pubDate>${PUB_DATE}</pubDate>
      <enclosure url="${ARM64_URL}" sparkle:edSignature="${ARM64_SIG}" length="${ARM64_LEN}" type="application/octet-stream" />
    </item>
    <item>
      <title>${VERSION}</title>
      <sparkle:version>${VERSION}</sparkle:version>
      <sparkle:shortVersionString>${VERSION}</sparkle:shortVersionString>
      <sparkle:channel>x64</sparkle:channel>
      <pubDate>${PUB_DATE}</pubDate>
      <enclosure url="${X64_URL}" sparkle:edSignature="${X64_SIG}" length="${X64_LEN}" type="application/octet-stream" />
    </item>
  </channel>
</rss>
EOF
