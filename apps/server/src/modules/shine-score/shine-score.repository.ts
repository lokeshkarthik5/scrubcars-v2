import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bookings, jobPhotos, services, shineJobScores, shineScans, users, vendors } from '../../db/schema.js'
import type { ShineReviewStatus } from '../../db/schema.js'
import type { ScanToday } from '../../lib/shine-score.js'

/**
 * Shine Score's database reads and writes (0075). No rules here: the
 * service passes in what to decide (a scan's go-ahead) and what to write.
 * Every read is awaited on its own (one connection in production).
 */

export type ShineScanRow = typeof shineScans.$inferSelect
export type ShineJobScoreRow = typeof shineJobScores.$inferSelect

/** The customer's lock on their scans: the day's count is read under it. Taken on its own. */
const scanLockKey = (userId: string) => `shine-scans:${userId}`

export const shineScoreRepository = {
  /** Today's scans of a customer (any status), for the free-scans count. */
  async listScansOfDay(userId: string, istDay: string): Promise<ScanToday[]> {
    return db
      .select({ status: shineScans.status, createdAt: shineScans.createdAt })
      .from(shineScans)
      .where(and(eq(shineScans.userId, userId), eq(shineScans.istDay, istDay)))
  },

  /**
   * Starts a scan if `decide` allows it, counting under the customer's lock
   * so two taps at once cannot both take the last free scan. Returns the new
   * scan's id, or the refusal `decide` gave.
   */
  async reserveScan<R extends string>(input: {
    userId: string
    istDay: string
    decide: (today: ScanToday[]) => R | null
  }): Promise<{ scanId: string } | { refusal: R }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scanLockKey(input.userId)})::bigint)`)
      const today = await tx
        .select({ status: shineScans.status, createdAt: shineScans.createdAt })
        .from(shineScans)
        .where(and(eq(shineScans.userId, input.userId), eq(shineScans.istDay, input.istDay)))
      const refusal = input.decide(today)
      if (refusal) return { refusal }
      const [row] = await tx
        .insert(shineScans)
        .values({ userId: input.userId, istDay: input.istDay, status: 'scoring' })
        .returning({ id: shineScans.id })
      return { scanId: row!.id }
    })
  },

  async finishScan(
    scanId: string,
    data: {
      overall: number
      scores: Record<string, number>
      findings: Array<{ text: string; area: string }>
      summary: string
      suggestion: string
      scoredAt: Date
    }
  ) {
    await db
      .update(shineScans)
      .set({ status: 'scored', ...data })
      .where(and(eq(shineScans.id, scanId), eq(shineScans.status, 'scoring')))
  },

  async setScanPhotos(scanId: string, photoKeys: string[]) {
    await db.update(shineScans).set({ photoKeys }).where(eq(shineScans.id, scanId))
  },

  async failScan(scanId: string) {
    await db
      .update(shineScans)
      .set({ status: 'failed' })
      .where(and(eq(shineScans.id, scanId), eq(shineScans.status, 'scoring')))
  },

  /** One of the customer's own scans; anyone else's is not found. */
  async findOwnScan(userId: string, scanId: string): Promise<ShineScanRow | null> {
    const [row] = await db
      .select()
      .from(shineScans)
      .where(and(eq(shineScans.id, scanId), eq(shineScans.userId, userId)))
      .limit(1)
    return row ?? null
  },

  /** Scans past their keeping time, oldest first, a bounded batch. */
  async listExpiredScans(before: Date, limit: number) {
    return db
      .select({ id: shineScans.id, photoKeys: shineScans.photoKeys })
      .from(shineScans)
      .where(lt(shineScans.createdAt, before))
      .orderBy(asc(shineScans.createdAt))
      .limit(limit)
  },

  async deleteScans(ids: string[]) {
    if (ids.length === 0) return 0
    const gone = await db.delete(shineScans).where(inArray(shineScans.id, ids)).returning({ id: shineScans.id })
    return gone.length
  },

  // ─── Suggestions ───────────────────────────────────────────────────────────

  /** The bookable services of these garages (no add-ons, packages, deleted or switched-off ones). */
  async listServicesOf(vendorIds: string[]) {
    if (vendorIds.length === 0) return []
    return db
      .select({
        id: services.id,
        vendorId: services.vendorId,
        name: services.name,
        category: services.category,
        pricingType: services.pricingType,
        price: services.price,
        priceHatchback: services.priceHatchback,
        priceSedan: services.priceSedan,
        priceSuv: services.priceSuv,
        durationMins: services.durationMins,
      })
      .from(services)
      .where(
        and(
          inArray(services.vendorId, vendorIds),
          eq(services.isActive, true),
          eq(services.isAddon, false),
          ne(services.category, 'package'),
          isNull(services.deletedAt)
        )
      )
  },

  // ─── Finished jobs ─────────────────────────────────────────────────────────

  /** A booking's facts for scoring: who, which garage, where it stands. */
  async findBooking(bookingId: string) {
    const [row] = await db
      .select({
        id: bookings.id,
        userId: bookings.userId,
        vendorId: bookings.vendorId,
        status: bookings.status,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1)
    return row ?? null
  },

  /** The garage's before and after photos of a booking (never the customer's). */
  async listGaragePhotos(bookingId: string) {
    return db
      .select({
        id: jobPhotos.id,
        stage: jobPhotos.stage,
        angle: jobPhotos.angle,
        storageKey: jobPhotos.storageKey,
        url: jobPhotos.url,
        createdAt: jobPhotos.createdAt,
      })
      .from(jobPhotos)
      .where(and(eq(jobPhotos.bookingId, bookingId), eq(jobPhotos.uploadedByRole, 'garage')))
  },

  /** The garage's photos of several bookings in one read (admin's list). */
  async listGaragePhotosOf(bookingIds: string[]) {
    if (bookingIds.length === 0) return []
    return db
      .select({
        id: jobPhotos.id,
        bookingId: jobPhotos.bookingId,
        stage: jobPhotos.stage,
        angle: jobPhotos.angle,
        storageKey: jobPhotos.storageKey,
        url: jobPhotos.url,
        createdAt: jobPhotos.createdAt,
      })
      .from(jobPhotos)
      .where(and(inArray(jobPhotos.bookingId, bookingIds), eq(jobPhotos.uploadedByRole, 'garage')))
  },

  async findJobScore(bookingId: string): Promise<ShineJobScoreRow | null> {
    const [row] = await db.select().from(shineJobScores).where(eq(shineJobScores.bookingId, bookingId)).limit(1)
    return row ?? null
  },

  /**
   * Claims a booking's scoring: a new row, or another go at a failed one
   * (fewer than `maxAttempts` tries, the last before `retryBefore`), or one
   * whose scoring went quiet before `staleBefore`. True
   * when this caller should score it; false when someone is, or it is done.
   */
  async claimJobScore(input: {
    bookingId: string
    vendorId: string
    maxAttempts: number
    retryBefore: Date
    staleBefore: Date
  }) {
    const rows = await db
      .insert(shineJobScores)
      .values({ bookingId: input.bookingId, vendorId: input.vendorId, status: 'scoring' })
      .onConflictDoUpdate({
        target: shineJobScores.bookingId,
        set: { status: 'scoring', attempts: sql`${shineJobScores.attempts} + 1`, updatedAt: new Date() },
        setWhere: and(
          lt(shineJobScores.attempts, input.maxAttempts),
          or(
            and(eq(shineJobScores.status, 'failed'), lt(shineJobScores.updatedAt, input.retryBefore)),
            // A scoring cut off half way (the function frozen) says nothing for good.
            and(eq(shineJobScores.status, 'scoring'), lt(shineJobScores.updatedAt, input.staleBefore))
          )
        ),
      })
      .returning({ id: shineJobScores.id })
    return rows.length > 0
  },

  async saveJobScore(
    bookingId: string,
    data: {
      areas: string[]
      beforeOverall: number
      afterOverall: number
      beforeScores: Record<string, number>
      afterScores: Record<string, number>
      findings: Array<{ text: string; area: string }>
      reviewStatus: ShineReviewStatus | null
      scoredAt: Date
    }
  ) {
    await db
      .update(shineJobScores)
      .set({ status: 'scored', ...data, updatedAt: data.scoredAt })
      .where(and(eq(shineJobScores.bookingId, bookingId), eq(shineJobScores.status, 'scoring')))
  },

  async endJobScore(bookingId: string, status: 'no_match' | 'failed') {
    await db
      .update(shineJobScores)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(shineJobScores.bookingId, bookingId), eq(shineJobScores.status, 'scoring')))
  },

  /** Jobs finished since `since` with no score row yet: the cron's catch-up. */
  async listFinishedWithoutScore(since: Date, limit: number) {
    return db
      .select({ id: bookings.id })
      .from(bookings)
      .leftJoin(shineJobScores, eq(shineJobScores.bookingId, bookings.id))
      .where(and(eq(bookings.status, 'completed'), gte(bookings.completedAt, since), isNull(shineJobScores.id)))
      .orderBy(desc(bookings.completedAt))
      .limit(limit)
  },

  // ─── Admin: Shine checks ───────────────────────────────────────────────────

  async countReviews() {
    return db
      .select({ status: shineJobScores.reviewStatus, count: count() })
      .from(shineJobScores)
      .where(sql`${shineJobScores.reviewStatus} is not null`)
      .groupBy(shineJobScores.reviewStatus)
  },

  async listReviews(status: ShineReviewStatus, limit: number) {
    return db
      .select({
        score: shineJobScores,
        bookingScheduledAt: bookings.scheduledAt,
        bookingMarkedTest: bookings.markedTestAt,
        garageName: vendors.businessName,
        customerId: users.id,
        customerName: users.name,
        customerPhone: users.phone,
      })
      .from(shineJobScores)
      .innerJoin(bookings, eq(bookings.id, shineJobScores.bookingId))
      .leftJoin(vendors, eq(vendors.id, shineJobScores.vendorId))
      .leftJoin(users, eq(users.id, bookings.userId))
      .where(eq(shineJobScores.reviewStatus, status))
      .orderBy(status === 'new' ? asc(shineJobScores.scoredAt) : desc(shineJobScores.reviewedAt))
      .limit(limit)
  },

  async findReview(id: string) {
    const [row] = await db.select().from(shineJobScores).where(eq(shineJobScores.id, id)).limit(1)
    return row ?? null
  },

  /** Marks a New check reviewed, once: null when it was not New any more. */
  async markReviewed(id: string, outcome: 'looks_fine' | 'followed_up', actorName: string, at: Date) {
    const [row] = await db
      .update(shineJobScores)
      .set({ reviewStatus: outcome, reviewedAt: at, reviewedBy: actorName, updatedAt: at })
      .where(and(eq(shineJobScores.id, id), eq(shineJobScores.reviewStatus, 'new')))
      .returning({ id: shineJobScores.id })
    return row ?? null
  },
}
