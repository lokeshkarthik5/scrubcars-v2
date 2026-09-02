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

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
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