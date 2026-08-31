import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 20,
  ssl: 'require',
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