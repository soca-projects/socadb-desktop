#!/usr/bin/env bash
# The certificate isn't handed to Tauri through APPLE_CERTIFICATE because the
# runtime binaries are signed by mcp-server/src/build.ts, which runs before
# Tauri sets up its own keychain.

set -euo pipefail

: "${APPLE_CERTIFICATE:?}" "${APPLE_CERTIFICATE_PASSWORD:?}" "${KEYCHAIN_PASSWORD:?}"
: "${APPLE_API_KEY:?}" "${APPLE_API_ISSUER:?}" "${APPLE_API_KEY_P8:?}" "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}"

INTERMEDIATE_URL="https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer"
INTERMEDIATE_SHA="f16cd3c54c7f83cea4bf1a3e6a0819c8aaa8e4a1528fd144715f350643d2df3a"

WORK="${RUNNER_TEMP}/macos-signing"
KEYCHAIN="${WORK}/signing.keychain-db"
mkdir -p "${WORK}"
chmod 700 "${WORK}"

curl -fsSL "${INTERMEDIATE_URL}" -o "${WORK}/intermediate.cer"
echo "${INTERMEDIATE_SHA}  ${WORK}/intermediate.cer" | shasum -a 256 -c -

printf '%s' "${APPLE_CERTIFICATE}" | base64 --decode > "${WORK}/certificate.p12"

security create-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN}"
security set-keychain-settings -lut 21600 "${KEYCHAIN}"
security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN}"
security import "${WORK}/certificate.p12" -k "${KEYCHAIN}" -P "${APPLE_CERTIFICATE_PASSWORD}" \
  -T /usr/bin/codesign -T /usr/bin/security
if ! security find-certificate -a -Z -c "Developer ID Certification Authority" "${KEYCHAIN}" \
  | grep -qi "${INTERMEDIATE_SHA}"; then
  security import "${WORK}/intermediate.cer" -k "${KEYCHAIN}"
fi
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN}" > /dev/null
rm -f "${WORK}/certificate.p12"

keychains=("${KEYCHAIN}")
while IFS= read -r line; do
  keychains+=("$(printf '%s' "${line}" | sed -e 's/^[[:space:]]*"//' -e 's/"$//')")
done < <(security list-keychains -d user)
security list-keychains -d user -s "${keychains[@]}"

identity="$(security find-identity -v -p codesigning "${KEYCHAIN}" \
  | sed -n 's/.*"\(Developer ID Application: .*\)"$/\1/p' | head -n 1)"
if [ -z "${identity}" ]; then
  echo "APPLE_CERTIFICATE holds no valid Developer ID Application identity" >&2
  exit 1
fi

key_path="${WORK}/AuthKey_${APPLE_API_KEY}.p8"
printf '%s\n' "${APPLE_API_KEY_P8}" > "${key_path}"
chmod 600 "${key_path}"

{
  echo "APPLE_SIGNING_IDENTITY=${identity}"
  echo "APPLE_API_KEY_PATH=${key_path}"
} >> "${GITHUB_ENV}"

echo "Signing as ${identity}"
