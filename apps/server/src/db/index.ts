import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL!

// Supabase requires TLS, so `require` stays the default. A local Postgres —
// the Docker instance the E2E suite runs against — offers none, and forcing
// TLS there fails the connection outright. Honour libpq's own switch rather
// than inventing a flag: `?sslmode=disable` in the URL turns it off, and psql
// (which the migration runner shells out to) already reads it the same way.
const sslDisabled = /[?&]sslmode=disable(&|$)/.test(connectionString)

// One connection in production. A Vercel instance that opened a handful each
// would exhaust Supabase's pooler as instances scaled, and Home is written to
// await its reads one by one on that single connection. The e2e suite sets
// PG_POOL_MAX so its workers are not stuck behind each other; unset stays 1.
function connectionPoolMax(): number {
  const raw = process.env.PG_POOL_MAX
  if (raw === undefined || raw === '') return 1
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`PG_POOL_MAX must be a positive integer, got ${JSON.stringify(raw)}`)
  }
  const max = Number(raw)
  if (max > 20) {
    throw new Error(`PG_POOL_MAX is ${max}; the cap is 20 so a typo cannot open a connection storm`)
  }
  return max
}

const client = postgres(connectionString, {
  prepare: false,
  max: connectionPoolMax(),
  connect_timeout: 10,
  idle_timeout: 20,
  ssl: sslDisabled ? false : 'require',
})

const queryLogger =
  process.env.LOG_QUERIES === 'true'
    ? {
        logQuery(sql: string, params: unknown[]) {
          console.log('[QUERY]', sql.trim(), params.length ? params : '')
        },
      }
    : undefined

export const db = drizzle(client, { schema, logger: queryLogger })