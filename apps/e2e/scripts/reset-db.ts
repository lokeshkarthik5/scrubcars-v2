/**
 * Drop, migrate and seed the E2E database.
 *
 * Migrations are the repo's own raw-SQL runner (apps/server/scripts/migrate.sh),
 * not drizzle-kit — running anything else here would test a schema the
 * production database has never seen.
 *
 * Refuses to touch anything that isn't the local test database, because the
 * first statement it runs is DROP SCHEMA.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const dir = path.dirname(fileURLToPath(import.meta.url))
const e2eRoot = path.resolve(dir, '..')
const serverRoot = path.resolve(e2eRoot, '../server')

loadEnv({ path: path.join(e2eRoot, '.env.e2e') })

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error('DIRECT_URL is not set — did .env.e2e load?')
}

// The guard rail. This script drops a schema; it must never be aimed at a
// database someone cares about. Both conditions have to hold.
const isLocal = /@(localhost|127\.0\.0\.1):/.test(url)
const isE2eDatabase = /\/detlio_e2e(\?|$)/.test(url)

if (!isLocal || !isE2eDatabase) {
  throw new Error(
    `Refusing to reset a database that is not local detlio_e2e.\n` +
      `  Got: ${url.replace(/:[^:@]*@/, ':***@')}\n` +
      `  Expected a URL on localhost pointing at the detlio_e2e database.`
  )
}

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env: process.env })

console.log('[e2e] dropping schema…')
run(
  'psql',
  [
    url,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    // `gis` holds PostGIS and is created by migration 0022; dropping and
    // recreating `public` alone would leave a half-migrated database behind.
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS gis CASCADE; CREATE SCHEMA public;',
  ],
  e2eRoot
)

console.log('[e2e] applying migrations…')
run('bash', ['scripts/migrate.sh', 'migrate'], serverRoot)

console.log('[e2e] seeding…')
// The workspace-local tsx, not `npx tsx` — no network round-trip, and the
// version is the one in this package's lockfile entry.
run(path.join(e2eRoot, 'node_modules/.bin/tsx'), ['src/db/seeds/e2e.ts'], serverRoot)

console.log('[e2e] database ready.')
