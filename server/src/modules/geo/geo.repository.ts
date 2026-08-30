import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { geoCache } from '../../db/schema.js'

/**
 * Cached provider responses. All DB access for the geo module, no logic.
 *
 * TTL is applied on read rather than by a scheduler: an expired row simply
 * misses and is overwritten on the next lookup, so nothing has to run on a
 * timer for correctness. `purgeExpired` is housekeeping only.
 */
export const geoRepository = {
  async get<T>(cacheKey: string, ttlHours: number): Promise<T | null> {
    const [row] = await db
      .select({ payload: geoCache.payload })
      .from(geoCache)
      .where(
        and(
          eq(geoCache.cacheKey, cacheKey),
          gt(geoCache.createdAt, sql`now() - make_interval(hours => ${ttlHours})`)
        )
      )
      .limit(1)

    return (row?.payload as T) ?? null
  },

  async set(cacheKey: string, payload: unknown): Promise<void> {
    await db
      .insert(geoCache)
      .values({ cacheKey, payload })
      .onConflictDoUpdate({
        target: geoCache.cacheKey,
        set: { payload, createdAt: sql`now()` },
      })
  },

  async purgeExpired(ttlHours: number): Promise<number> {
    const rows = await db
      .delete(geoCache)
      .where(sql`${geoCache.createdAt} < now() - make_interval(hours => ${ttlHours})`)
      .returning({ cacheKey: geoCache.cacheKey })

    return rows.length
  },
}
