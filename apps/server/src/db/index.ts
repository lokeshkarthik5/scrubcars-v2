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

/**
 * A connection is trusted for this long after the API last used it. A Vercel
 * instance sleeps between requests, and a connection left open while it
 * sleeps can be closed or forgotten at the other end without the instance
 * hearing about it. The next request then writes into a dead socket: it fails
 * at once ("Internal server error") or, where nothing answers at all, waits
 * until the 60-second function limit (a 504). That is what the live garage
 * list, garage page and map did after speed fix 5 kept connections for four
 * minutes. Taps a few seconds apart still share one warm connection.
 */
export const DB_STALE_AFTER_MS = 20_000

function openClient() {
  return postgres(connectionString, {
    prepare: false,
    max: connectionPoolMax(),
    connect_timeout: 10,
    // Closed by the client while the instance is awake; DB_STALE_AFTER_MS
    // covers the time it spends asleep, when no timer runs.
    idle_timeout: 20,
    ssl: sslDisabled ? false : 'require',
  })
}

const logQueries = process.env.LOG_QUERIES === 'true'

/** The table the latest statement on this instance read or wrote, for REQUEST_STUCK (app.ts). */
let lastTable: string | null = null

/** `from "reviews"` / `into "bookings"` / `update "vendors"` → reviews. Table names only, never values. */
export function tableOf(statement: string): string | null {
  const match = /\b(?:from|into|update|join)\s+"?([a-z_][a-z0-9_]*)"?/i.exec(statement)
  return match ? match[1].toLowerCase() : null
}

const queryLogger = {
  logQuery(sql: string, params: unknown[]) {
    lastTable = tableOf(sql) ?? lastTable
    if (logQueries) console.log('[QUERY]', sql.trim(), params.length ? params : '')
  },
}

/** What the latest statement touched (see lastTable). */
export const lastStatementTable = () => lastTable

const connect = (client: ReturnType<typeof openClient>) => drizzle(client, { schema, logger: queryLogger })

let client = openClient()
let current = connect(client)
let lastActive = Date.now()
let inFlight = 0
let generation = 0

/** How many connections this instance has opened (for tests). */
export const dbGeneration = () => generation

/**
 * Called as each request starts (app.ts); the function it returns, as it ends.
 * With nothing in flight and nothing done for DB_STALE_AFTER_MS, the old
 * connection is let go (given five seconds for anything still finishing in
 * the background) and the request gets a new one.
 */
/**
 * Lets the current connection go at once (its statements fail) and opens a
 * new one: called when a request has been stuck too long (app.ts), so the
 * requests after it on this instance are not queued behind it.
 */
export function abandonDb(): void {
  const old = client
  client = openClient()
  current = connect(client)
  generation += 1
  inFlight = 0
  lastActive = Date.now()
  void old.end({ timeout: 0 }).catch(() => {})
}

export function useFreshDb(now: number = Date.now()): () => void {
  if (inFlight === 0 && now - lastActive > DB_STALE_AFTER_MS) {
    const old = client
    client = openClient()
    current = connect(client)
    generation += 1
    void old.end({ timeout: 5 }).catch(() => {})
  }
  inFlight += 1
  const startedOn = generation
  let done = false
  return () => {
    if (done) return
    done = true
    // A request whose connection was abandoned (abandonDb) was already let go.
    if (startedOn === generation) inFlight -= 1
    lastActive = Date.now()
  }
}

type Db = typeof current

/** The database, always through the current connection (useFreshDb). */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const value = Reflect.get(current, prop, current)
    return typeof value === 'function' ? value.bind(current) : value
  },
  has: (_target, prop) => Reflect.has(current, prop),
  // Tests swap a method for a while (booking-requests.locks.test.ts).
  set: (_target, prop, value) => Reflect.set(current, prop, value),
  deleteProperty: (_target, prop) => Reflect.deleteProperty(current, prop),
})
