#!/usr/bin/env bash
#
# Apply SQL migrations from server/drizzle/ using the psql client.
#
# Usage:
#   ./scripts/migrate.sh [command] [options]
#
# Commands:
#   migrate   Apply pending migrations (default)
#   status    Show applied and pending migrations
#   check     Validate journal, checksums, and ordering without applying
#   help      Show usage
#
# Options:
#   --dry-run   Print actions without executing SQL (migrate only)
#
# Environment:
#   DATABASE_URL   PostgreSQL connection string (required)
#
# Loads server/.env automatically when present.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly MIGRATIONS_DIR="${SERVER_DIR}/drizzle"
readonly JOURNAL_FILE="${MIGRATIONS_DIR}/meta/_journal.json"
readonly MIGRATIONS_TABLE="schema_migrations"
readonly ADVISORY_LOCK_KEY="83927401"

COMMAND="migrate"
DRY_RUN=false

log() {
  printf '[migrate] %s\n' "$*"
}

die() {
  printf '[migrate] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

load_env() {
  if [[ -f "${SERVER_DIR}/.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "${SERVER_DIR}/.env"
    set +a
  fi

  if [[ -z "${DIRECT_URL:-}" ]]; then
    die "DIRECT_URL is not set. Add it to server/.env (direct Supabase connection, port 5432)"
  fi
}

require_psql() {
  command -v psql >/dev/null 2>&1 || die "psql is not installed or not on PATH"
}

checksum_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    die "Need sha256sum or shasum to verify migration checksums"
  fi
}

psql_exec() {
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qAt "$@"
}

psql_file() {
  local file="$1"
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q -f "$file"
}

ensure_migrations_table() {
  psql_exec <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          SERIAL PRIMARY KEY,
  version     VARCHAR(255) NOT NULL UNIQUE,
  filename    VARCHAR(255) NOT NULL,
  checksum    VARCHAR(64)  NOT NULL,
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
SQL
}

acquire_lock() {
  local locked
  locked="$(psql_exec -c "SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY});")"
  [[ "$locked" == "t" ]] || die "Another migration process holds the advisory lock"
}

release_lock() {
  psql_exec -c "SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY});" >/dev/null || true
}

migration_version_from_file() {
  local file="$1"
  local version
  version="$(basename "$file" .sql)"
  [[ "$version" =~ ^[0-9]{4}_[a-z0-9_]+$ ]] || die "Invalid migration filename: ${version}"
  printf '%s' "$version"
}

migration_applied() {
  local version="$1"
  local count
  count="$(psql_exec -c "SELECT COUNT(*) FROM ${MIGRATIONS_TABLE} WHERE version = '${version}';")"
  [[ "$count" == "1" ]]
}

stored_checksum() {
  local version="$1"
  psql_exec -c "SELECT checksum FROM ${MIGRATIONS_TABLE} WHERE version = '${version}';"
}

record_migration() {
  local version="$1"
  local filename="$2"
  local checksum="$3"

  psql_exec <<SQL
INSERT INTO ${MIGRATIONS_TABLE} (version, filename, checksum)
VALUES ('${version}', '${filename}', '${checksum}');
SQL
}

discover_migrations() {
  local -a files=()
  local file

  if [[ ! -d "$MIGRATIONS_DIR" ]]; then
    die "Migrations directory not found: ${MIGRATIONS_DIR}"
  fi

  shopt -s nullglob
  for file in "${MIGRATIONS_DIR}"/[0-9]*.sql; do
    files+=("$file")
  done
  shopt -u nullglob

  if [[ ${#files[@]} -eq 0 ]]; then
    die "No migration files found in ${MIGRATIONS_DIR}"
  fi

  printf '%s\n' "${files[@]}" | sort
}

validate_journal() {
  [[ -f "$JOURNAL_FILE" ]] || die "Drizzle journal not found: ${JOURNAL_FILE}"

  if ! command -v jq >/dev/null 2>&1; then
    log "jq not installed; skipping journal cross-check"
    return 0
  fi

  local -a journal_tags=()
  local -a file_tags=()
  local tag file base

  while IFS= read -r tag; do
    journal_tags+=("$tag")
  done < <(jq -r '.entries[].tag' "$JOURNAL_FILE")

  while IFS= read -r file; do
    base="$(basename "$file" .sql)"
    file_tags+=("$base")
  done < <(discover_migrations)

  if [[ ${#journal_tags[@]} -ne ${#file_tags[@]} ]]; then
    die "Journal entry count (${#journal_tags[@]}) does not match SQL files (${#file_tags[@]})"
  fi

  local i
  for i in "${!journal_tags[@]}"; do
    if [[ "${journal_tags[$i]}" != "${file_tags[$i]}" ]]; then
      die "Journal order mismatch at index ${i}: journal=${journal_tags[$i]} file=${file_tags[$i]}"
    fi
  done
}

validate_checksums() {
  local file version current stored

  while IFS= read -r file; do
    version="$(migration_version_from_file "$file")"
    current="$(checksum_file "$file")"

    if migration_applied "$version"; then
      stored="$(stored_checksum "$version")"
      if [[ "$stored" != "$current" ]]; then
        die "Checksum mismatch for applied migration ${version}. File was modified after apply."
      fi
    fi
  done < <(discover_migrations)
}

validate_sequence() {
  local file version last_idx=-1 idx

  while IFS= read -r file; do
    version="$(migration_version_from_file "$file")"
    idx=$((10#${version%%_*}))

    if (( idx <= last_idx )); then
      die "Migration sequence error: ${version} is out of order"
    fi
    last_idx=$idx
  done < <(discover_migrations)
}

cmd_status() {
  ensure_migrations_table

  local file version checksum applied
  local pending=0 applied_count=0

  printf '%-36s %-12s %s\n' "VERSION" "STATUS" "CHECKSUM"
  printf '%-36s %-12s %s\n' "-------" "------" "--------"

  while IFS= read -r file; do
    version="$(migration_version_from_file "$file")"
    checksum="$(checksum_file "$file" | cut -c1-12)"

    if migration_applied "$version"; then
      applied="applied"
      applied_count=$((applied_count + 1))
      stored="$(stored_checksum "$version")"
      current="$(checksum_file "$file")"
      if [[ "$stored" != "$current" ]]; then
        applied="MODIFIED"
      fi
    else
      applied="pending"
      pending=$((pending + 1))
    fi

    printf '%-36s %-12s %s...\n' "$version" "$applied" "$checksum"
  done < <(discover_migrations)

  log "${applied_count} applied, ${pending} pending"
}

cmd_check() {
  require_psql
  psql_exec -c "SELECT 1;" >/dev/null
  validate_journal
  validate_sequence
  ensure_migrations_table
  validate_checksums
  log "All migration checks passed"
}

apply_pending() {
  local file version filename checksum stored

  while IFS= read -r file; do
    version="$(migration_version_from_file "$file")"
    filename="$(basename "$file")"
    checksum="$(checksum_file "$file")"

    if migration_applied "$version"; then
      stored="$(stored_checksum "$version")"
      [[ "$stored" == "$checksum" ]] || die "Checksum mismatch for applied migration ${version}"
      log "skip  ${version} (already applied)"
      continue
    fi

    if [[ "$DRY_RUN" == true ]]; then
      log "dry-run apply ${version} <- ${filename}"
      continue
    fi

    log "apply ${version} <- ${filename}"
    psql_file "$file"
    record_migration "$version" "$filename" "$checksum"
    log "done  ${version}"
  done < <(discover_migrations)
}

cmd_migrate() {
  require_psql
  psql_exec -c "SELECT 1;" >/dev/null || die "Cannot connect to database"

  validate_journal
  validate_sequence
  ensure_migrations_table
  validate_checksums

  acquire_lock
  trap release_lock EXIT

  apply_pending

  trap - EXIT
  release_lock

  log "Migration complete"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      migrate|status|check|help)
        COMMAND="$1"
        shift
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      -h|--help)
        COMMAND="help"
        shift
        ;;
      *)
        die "Unknown argument: $1 (try --help)"
        ;;
    esac
  done
}

main() {
  parse_args "$@"
  load_env

  case "$COMMAND" in
    migrate) cmd_migrate ;;
    status)  cmd_status ;;
    check)   cmd_check ;;
    help)    usage ;;
    *)       die "Unknown command: $COMMAND" ;;
  esac
}

main "$@"
