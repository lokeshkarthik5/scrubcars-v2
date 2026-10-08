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
#   lint      File-only checks (naming, numbering, journal, transaction
#             safety). Needs no database, so it runs on pull requests
#   help      Show usage
#
# Options:
#   --dry-run   Print actions without executing SQL (migrate only)
#
# Environment:
#   DIRECT_URL             PostgreSQL connection string (required except for lint)
#   MIGRATE_LOCK_TIMEOUT   Longest a statement may wait for a table lock before
#                          the migration gives up and rolls back (default 5s)
#
# Loads server/.env automatically when present.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SERVER_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly MIGRATIONS_DIR="${SERVER_DIR}/drizzle"
readonly JOURNAL_FILE="${MIGRATIONS_DIR}/meta/_journal.json"
readonly MIGRATIONS_TABLE="schema_migrations"
readonly ADVISORY_LOCK_KEY="83927401"

# DDL needs an exclusive lock on its table, and while it waits for one, every
# new query on that table queues behind it. Without a cap, one slow query turns
# a 50ms migration into an outage. With it, the migration rolls back and can be
# retried. Only waiting is capped; a migration that holds its locks may run as
# long as it needs.
readonly LOCK_TIMEOUT="${MIGRATE_LOCK_TIMEOUT:-5s}"

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
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
}

load_env() {
  # An explicitly exported DIRECT_URL beats server/.env.
  #
  # `set -a; source .env` overwrites variables that are already exported, so
  # without this a caller deliberately pointing at another database — the E2E
  # harness, a staging restore — would be silently redirected to whatever .env
  # holds, which is production. Dotfiles fill in blanks; they do not override
  # an explicit choice.
  local direct_url_override="${DIRECT_URL:-}"

  if [[ -f "${SERVER_DIR}/.env" ]]; then
    # shellcheck disable=SC1091
    set -a
    source "${SERVER_DIR}/.env"
    set +a
  fi

  if [[ -n "${direct_url_override}" ]]; then
    DIRECT_URL="${direct_url_override}"
    export DIRECT_URL
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

# Runs one migration file and records it in schema_migrations as a single
# transaction: either both land or neither does. A failure half-way through
# leaves the database exactly as it was, so the next run retries the whole file.
#
# The advisory lock is transaction-scoped, so it is held for exactly as long as
# the work it protects and is released by COMMIT, ROLLBACK or a dropped
# connection alike — nothing can leak it. Under the lock the applied check is
# repeated, because another runner may have applied this file between our
# earlier read and now.
#
# Prints "applied" or "skipped". On any SQL error psql exits non-zero
# (ON_ERROR_STOP) with the transaction still open, which the server rolls back.
apply_migration() {
  local file="$1"
  local version="$2"
  local filename="$3"
  local checksum="$4"

  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 --no-psqlrc -qAt <<SQL
BEGIN;
DO \$\$
BEGIN
  IF NOT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) THEN
    RAISE EXCEPTION 'Another migration process holds the advisory lock';
  END IF;
END
\$\$;
SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';
SELECT EXISTS (SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE version = '${version}') AS already_applied \gset
\if :already_applied
  ROLLBACK;
  \echo skipped
\else
  \i '${file}'
  INSERT INTO ${MIGRATIONS_TABLE} (version, filename, checksum)
  VALUES ('${version}', '${filename}', '${checksum}');
  COMMIT;
  \echo applied
\endif
SQL
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

  # A skipped check is a check that silently passes, so jq is required.
  command -v jq >/dev/null 2>&1 || die "jq is required to validate the journal (brew install jq)"

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

# Numbers must run 0000, 0001, 0002 … with no duplicates and no gaps. A gap is
# how a migration gets applied out of order: if 0027 lands first and 0026 is
# merged later, 0026 would run on top of a schema written after it. Requiring
# every number to be exactly one more than the last makes that impossible.
validate_sequence() {
  local file version expected=0 idx

  while IFS= read -r file; do
    version="$(migration_version_from_file "$file")"
    idx=$((10#${version%%_*}))

    if (( idx < expected )); then
      die "Migration sequence error: ${version} reuses number $(printf '%04d' "$idx"). Renumber it to $(printf '%04d' "$expected") or later"
    elif (( idx > expected )); then
      die "Migration sequence error: expected $(printf '%04d' "$expected") next, found ${version}. Numbers must have no gaps"
    fi
    expected=$((idx + 1))
  done < <(discover_migrations)
}

# Every migration recorded as applied must still have its file. A deleted file
# means the repo no longer describes the schema the database actually has.
validate_no_missing_files() {
  local version missing=()

  while IFS= read -r version; do
    [[ -z "$version" ]] && continue
    [[ -f "${MIGRATIONS_DIR}/${version}.sql" ]] || missing+=("$version")
  done < <(psql_exec -c "SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version;")

  if [[ ${#missing[@]} -gt 0 ]]; then
    die "Applied migration(s) missing from ${MIGRATIONS_DIR}: ${missing[*]}. Restore the file(s); never delete an applied migration"
  fi
}

# Each file runs inside one transaction (see apply_migration). Statements that
# end that transaction early, or cannot run inside one, would quietly bring back
# half-applied migrations, so they are rejected up front.
validate_transactional() {
  local file hits

  while IFS= read -r file; do
    hits="$(grep -vE '^[[:space:]]*--' "$file" \
      | grep -niE '\b(begin|commit|rollback)[[:space:]]*;|start[[:space:]]+transaction|\bconcurrently\b|\bvacuum\b' \
      || true)"
    if [[ -n "$hits" ]]; then
      die "$(basename "$file") cannot run inside a transaction:
${hits}
Migrations are applied atomically. Drop explicit transaction control, and use
plain CREATE/DROP INDEX instead of CONCURRENTLY."
    fi
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

# Checks that need only the files on disk.
validate_files() {
  validate_journal
  validate_sequence
  validate_transactional
}

cmd_lint() {
  validate_files
  log "All migration file checks passed"
}

cmd_check() {
  require_psql
  psql_exec -c "SELECT 1;" >/dev/null || die "Cannot connect to database"
  validate_files
  ensure_migrations_table
  validate_no_missing_files
  validate_checksums
  log "All migration checks passed"
}

apply_pending() {
  local file version filename checksum stored result errfile

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
    errfile="$(mktemp)"
    if ! result="$(apply_migration "$file" "$version" "$filename" "$checksum" 2>"$errfile")"; then
      cat "$errfile" >&2
      if grep -q 'lock timeout' "$errfile"; then
        rm -f "$errfile"
        die "${version} waited over ${LOCK_TIMEOUT} for a table lock (a long query or open transaction was holding it) and was rolled back; nothing from it was applied. Safe to rerun"
      fi
      rm -f "$errfile"
      die "${version} failed and was rolled back; nothing from it was applied"
    fi
    cat "$errfile" >&2
    rm -f "$errfile"
    if [[ "$result" == "skipped" ]]; then
      log "skip  ${version} (applied by another runner)"
    else
      log "done  ${version}"
    fi
  done < <(discover_migrations)
}

cmd_migrate() {
  # Interpolated into SQL, so only a plain Postgres duration is accepted.
  [[ "$LOCK_TIMEOUT" =~ ^[0-9]+(ms|s|min)?$ ]] \
    || die "MIGRATE_LOCK_TIMEOUT must be a duration like 5s, 500ms or 1min (got: ${LOCK_TIMEOUT})"
  require_psql
  psql_exec -c "SELECT 1;" >/dev/null || die "Cannot connect to database"

  validate_files
  ensure_migrations_table
  validate_no_missing_files
  validate_checksums

  apply_pending

  log "Migration complete"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      migrate|status|check|lint|help)
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

  # lint and help never touch the database, so they must not demand DIRECT_URL.
  case "$COMMAND" in
    lint|help) ;;
    *) load_env ;;
  esac

  case "$COMMAND" in
    migrate) cmd_migrate ;;
    status)  cmd_status ;;
    check)   cmd_check ;;
    lint)    cmd_lint ;;
    help)    usage ;;
    *)       die "Unknown command: $COMMAND" ;;
  esac
}

main "$@"
