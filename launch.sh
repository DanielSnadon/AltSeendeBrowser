#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ -x dist/installers/linux-unpacked/altseende-browser ]]; then
  exec dist/installers/linux-unpacked/altseende-browser "$@"
fi
exec npm start -- "$@"
