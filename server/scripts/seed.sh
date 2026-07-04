#!/usr/bin/env bash
#
# Seed development users and vendors.
#
# Usage:
#   ./scripts/seed.sh [options]
#
# Options:
#   --users     Seed customers and vendor-owner users only
#   --vendors   Seed vendor profiles only
#   --help      Show help
#
# Loads server/.env when present.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${SERVER_DIR}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${SERVER_DIR}/.env"
  set +a
fi

cd "${SERVER_DIR}"
exec npx tsx src/db/seeds/index.ts "$@"
