#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ -x dist/AltSeende-linux-x64/AltSeende ]]; then
  exec dist/AltSeende-linux-x64/AltSeende "$@"
fi
exec npm start -- "$@"
