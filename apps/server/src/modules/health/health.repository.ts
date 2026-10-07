import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'

export const healthRepository = {
  /** The cheapest query that still proves a connection and a working server. */
  ping() {
    return db.execute(sql`select 1`)
  },
}
