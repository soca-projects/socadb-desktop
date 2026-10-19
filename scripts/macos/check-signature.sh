#!/usr/bin/env bash

set -euo pipefail

APP="${1:?usage: check-signature.sh path/to/SocaDB.app path/to/SocaDB.dmg}"
DMG="${2:?usage: check-signature.sh path/to/SocaDB.app path/to/SocaDB.dmg}"

codesign --verify --deep --strict --verbose=2 "${APP}"
assessment="$(spctl --assess --type execute --verbose=4 "${APP}" 2>&1 || true)"
echo "${assessment}"
grep -q "source=Notarized Developer ID" <<< "${assessment}"
xcrun stapler validate "${APP}"

assessment="$(spctl --assess --type open --context context:primary-signature --verbose=4 "${DMG}" 2>&1 || true)"
echo "${assessment}"
grep -q "source=Notarized Developer ID" <<< "${assessment}"
xcrun stapler validate "${DMG}"

team="$(codesign -dv "${APP}" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
echo "Team: ${team}"

failed=0
while IFS= read -r -d '' file; do
  file -b "${file}" | grep -q "Mach-O.*executable" || continue
  details="$(codesign -dv "${file}" 2>&1)"
  if ! grep -q "^TeamIdentifier=${team}$" <<< "${details}" || ! grep -q "flags=.*runtime" <<< "${details}"; then
    echo "Not signed with team ${team} and the hardened runtime: ${file}" >&2
    failed=1
  fi
done < <(find "${APP}/Contents" -type f -perm +111 -print0)
exit "${failed}"
