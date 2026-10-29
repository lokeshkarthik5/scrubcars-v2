import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  bookingItems,
  bookings,
  reviewReports,
  reviews,
  vendors,
} from '../../db/schema.js'
import type { ReviewTag } from '../../lib/ratings.js'
import { COUNTED_REVIEW, countedReview } from './reviews.predicates.js'

export type ReviewRecord = typeof reviews.$inferSelect

/** A group of counted reviews: their average stars and how many. */
export interface RatingAggregate {
  vendorId: string
  average: number
  count: number
}

export const reviewsRepository = {
  findBookingById(bookingId: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        service: true,
        vendor: true,
        review: true,
      },
    })
  },

  findVendorById(vendorId: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, vendorId),
    })
  },

  createReview(data: {
    bookingId: string
    userId: string
    vendorId: string
    rating: number
    comment?: string | null
    tags?: ReviewTag[]
  }) {
    return db
      .insert(reviews)
      .values({
        bookingId: data.bookingId,
        userId: data.userId,
        vendorId: data.vendorId,
        rating: data.rating,
        comment: data.comment ?? null,
        tags: data.tags ?? [],
      })
      .returning()
  },

  listReviewsForUser(userId: string) {
    return db.query.reviews.findMany({
      where: eq(reviews.userId, userId),
      with: {
        booking: {
          with: {
            service: true,
            items: { orderBy: [asc(bookingItems.sortOrder)] },
          },
        },
        vendor: true,
      },
      orderBy: [desc(reviews.createdAt)],
    })
  },

  /**
   * Feeds the public review list, so it loads only what that list shows: the
   * reviewer's name (never their phone) and the services' names. Counted
   * reviews only (0065): a Test booking's review, or one admin hid, is never
   * shown to anyone but admin.
   */
  listReviewsForVendor(vendorId: string) {
    return db.query.reviews.findMany({
      where: and(eq(reviews.vendorId, vendorId), countedReview()),
      with: {
        user: { columns: { name: true, deletedAt: true } },
        booking: {
          columns: { id: true },
          with: {
            service: { columns: { id: true, name: true } },
            items: {
              columns: { name: true },
              orderBy: [asc(bookingItems.sortOrder)],
            },
          },
        },
      },
      orderBy: [desc(reviews.createdAt)],
    })
  },

  /**
   * The counted reviews' average and count per garage (0065): the one read
   * every score is made from. A garage with none is absent.
   */
  async ratingAggregates(vendorIds: string[]): Promise<RatingAggregate[]> {
    if (vendorIds.length === 0) return []
    const rows = await db.execute<{
      vendor_id: string
      average: number | string
      count: number | string
    }>(sql`
      SELECT r.vendor_id, avg(r.rating)::float AS average, count(*)::int AS count
        FROM reviews r
       WHERE r.vendor_id IN (${sql.join(
         vendorIds.map((id) => sql`${id}::uuid`),
         sql`, `
       )})
         AND ${COUNTED_REVIEW}
       GROUP BY r.vendor_id
    `)
    return Array.from(rows).map((row) => ({
      vendorId: row.vendor_id,
      average: Number(row.average),
      count: Number(row.count),
    }))
  },

  /** How many counted reviews picked each tag, per garage. */
  async tagCounts(
    vendorIds: string[]
  ): Promise<Array<{ vendorId: string; tag: string; count: number }>> {
    if (vendorIds.length === 0) return []
    const rows = await db.execute<{
      vendor_id: string
      tag: string
      count: number | string
    }>(sql`
      SELECT r.vendor_id, t.tag, count(*)::int AS count
        FROM reviews r
       CROSS JOIN LATERAL unnest(r.tags) AS t(tag)
       WHERE r.vendor_id IN (${sql.join(
         vendorIds.map((id) => sql`${id}::uuid`),
         sql`, `
       )})
         AND ${COUNTED_REVIEW}
       GROUP BY r.vendor_id, t.tag
    `)
    return Array.from(rows).map((row) => ({
      vendorId: row.vendor_id,
      tag: row.tag,
      count: Number(row.count),
    }))
  },

  /** How many counted reviews gave each number of stars, for one garage. */
  async starCounts(
    vendorId: string
  ): Promise<Array<{ stars: number; count: number }>> {
    const rows = await db.execute<{
      stars: number
      count: number | string
    }>(sql`
      SELECT r.rating AS stars, count(*)::int AS count
        FROM reviews r
       WHERE r.vendor_id = ${vendorId}::uuid
         AND ${COUNTED_REVIEW}
       GROUP BY r.rating
    `)
    return Array.from(rows).map((row) => ({
      stars: Number(row.stars),
      count: Number(row.count),
    }))
  },

  // ─── The garage's own (0065) ──────────────────────────────────────────────

  /**
   * The garage's counted reviews with its reply, newest first, and whether
   * the garage has reported each. What its Reviews screen lists.
   */
  async listForGarage(vendorId: string) {
    const rows = await db.query.reviews.findMany({
      where: and(eq(reviews.vendorId, vendorId), countedReview()),
      with: {
        user: { columns: { name: true, deletedAt: true } },
        booking: {
          columns: { id: true },
          with: {
            items: {
              columns: { name: true },
              orderBy: [asc(bookingItems.sortOrder)],
            },
          },
        },
      },
      orderBy: [desc(reviews.createdAt)],
    })
    const reported = rows.length
      ? await db
          .select({ reviewId: reviewReports.reviewId })
          .from(reviewReports)
          .where(
            and(
              inArray(
                reviewReports.reviewId,
                rows.map((row) => row.id)
              ),
              eq(reviewReports.reporter, 'garage'),
              eq(reviewReports.vendorId, vendorId)
            )
          )
      : []
    const reportedIds = new Set(reported.map((row) => row.reviewId))
    return rows.map((row) => ({
      ...row,
      reportedByGarage: reportedIds.has(row.id),
    }))
  },

  /** One review of this garage, whatever its state; another garage's is undefined. */
  async findForGarage(vendorId: string, reviewId: string) {
    const [row] = await db
      .select({
        id: reviews.id,
        vendorId: reviews.vendorId,
        userId: reviews.userId,
        rating: reviews.rating,
        reply: reviews.reply,
        repliedAt: reviews.repliedAt,
        hiddenAt: reviews.hiddenAt,
        markedTest: sql<boolean>`${bookings.markedTestAt} is not null`,
      })
      .from(reviews)
      .innerJoin(bookings, eq(bookings.id, reviews.bookingId))
      .where(and(eq(reviews.id, reviewId), eq(reviews.vendorId, vendorId)))
      .limit(1)
    return row
  },

  /**
   * Posts or changes the garage's reply, only while the review is not hidden
   * and its reply is as the service saw it: none (a first reply), or the
   * one first posted at `repliedAt` (a change within its 24 hours, which the
   * service checked). Undefined when it moved meanwhile.
   */
  async setReply(input: {
    reviewId: string
    vendorId: string
    text: string
    by: string
    seenRepliedAt: Date | null
    at: Date
  }) {
    const [row] = await db
      .update(reviews)
      .set(
        input.seenRepliedAt
          ? { reply: input.text, replyUpdatedAt: input.at, repliedBy: input.by }
          : { reply: input.text, repliedAt: input.at, repliedBy: input.by }
      )
      .where(
        and(
          eq(reviews.id, input.reviewId),
          eq(reviews.vendorId, input.vendorId),
          isNull(reviews.hiddenAt),
          input.seenRepliedAt
            ? eq(reviews.repliedAt, input.seenRepliedAt)
            : isNull(reviews.repliedAt)
        )
      )
      .returning()
    return row
  },

  // ─── Reports (0065) ───────────────────────────────────────────────────────

  /** A review by id with its garage, for a report. */
  async findForReport(reviewId: string) {
    const [row] = await db
      .select({
        id: reviews.id,
        vendorId: reviews.vendorId,
        userId: reviews.userId,
        rating: reviews.rating,
        comment: reviews.comment,
        hiddenAt: reviews.hiddenAt,
        garage: vendors.businessName,
      })
      .from(reviews)
      .innerJoin(vendors, eq(vendors.id, reviews.vendorId))
      .where(eq(reviews.id, reviewId))
      .limit(1)
    return row
  },

  /**
   * Records a report; undefined when this person (or this garage) has
   * already reported the review (the unique indexes decide, so two presses
   * at once record one).
   */
  async insertReport(values: {
    reviewId: string
    reporter: 'customer' | 'garage'
    userId: string
    vendorId: string | null
    reason: string
  }) {
    const [row] = await db
      .insert(reviewReports)
      .values(values)
      .onConflictDoNothing()
      .returning()
    return row
  },

  // ─── Admin (0065) ─────────────────────────────────────────────────────────

  /**
   * Every review of a garage, Test bookings' and hidden ones included, with
   * whether it counts, the booking's reference and services, and its
   * reports. Newest first. The reviewer by name only, never a phone.
   */
  async listForAdmin(vendorId: string) {
    const rows = await db.query.reviews.findMany({
      where: eq(reviews.vendorId, vendorId),
      with: {
        user: { columns: { name: true } },
        booking: {
          columns: { id: true, scheduledAt: true, markedTestAt: true },
          with: {
            items: {
              columns: { name: true },
              orderBy: [asc(bookingItems.sortOrder)],
            },
          },
        },
      },
      orderBy: [desc(reviews.createdAt)],
    })
    const reports = rows.length
      ? await db
          .select({
            id: reviewReports.id,
            reviewId: reviewReports.reviewId,
            reporter: reviewReports.reporter,
            reason: reviewReports.reason,
            createdAt: reviewReports.createdAt,
          })
          .from(reviewReports)
          .where(
            inArray(
              reviewReports.reviewId,
              rows.map((row) => row.id)
            )
          )
          .orderBy(asc(reviewReports.createdAt))
      : []
    return rows.map((row) => ({
      ...row,
      reports: reports.filter((report) => report.reviewId === row.id),
    }))
  },

  async findForAdmin(reviewId: string) {
    const [row] = await db
      .select({
        id: reviews.id,
        vendorId: reviews.vendorId,
        hiddenAt: reviews.hiddenAt,
        vendorDeletedAt: vendors.deletedAt,
      })
      .from(reviews)
      .innerJoin(vendors, eq(vendors.id, reviews.vendorId))
      .where(eq(reviews.id, reviewId))
      .limit(1)
    return row
  },

  /**
   * Hides a review that is showing, with its audit row, in one transaction;
   * undefined when it was already hidden.
   */
  hide(
    reviewId: string,
    actor: { sub: string; name: string },
    reason: string,
    at: Date
  ) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(reviews)
        .set({ hiddenAt: at, hiddenBy: actor.name, hiddenReason: reason })
        .where(and(eq(reviews.id, reviewId), isNull(reviews.hiddenAt)))
        .returning({
          id: reviews.id,
          vendorId: reviews.vendorId,
          rating: reviews.rating,
        })
      if (!row) return undefined
      await tx.insert(adminAuditLog).values({
        action: 'review_hidden',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { reviewId, vendorId: row.vendorId },
        detail: { reason, rating: row.rating },
      })
      return row
    })
  },

  /**
   * Shows a hidden review again, with its audit row (which keeps who hid it,
   * when and why), in one transaction; undefined when it was not hidden.
   */
  show(reviewId: string, actor: { sub: string; name: string }) {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          hiddenAt: reviews.hiddenAt,
          hiddenBy: reviews.hiddenBy,
          hiddenReason: reviews.hiddenReason,
        })
        .from(reviews)
        .where(eq(reviews.id, reviewId))
        .for('update')
      if (!before?.hiddenAt) return undefined
      const [row] = await tx
        .update(reviews)
        .set({ hiddenAt: null, hiddenBy: null, hiddenReason: null })
        .where(and(eq(reviews.id, reviewId), isNotNull(reviews.hiddenAt)))
        .returning({ id: reviews.id, vendorId: reviews.vendorId })
      if (!row) return undefined
      await tx.insert(adminAuditLog).values({
        action: 'review_shown',
        actorSub: actor.sub,
        actorName: actor.name,
        summary: { reviewId, vendorId: row.vendorId },
        detail: {
          hiddenAt: before.hiddenAt.toISOString(),
          hiddenBy: before.hiddenBy,
          reason: before.hiddenReason,
        },
      })
      return row
    })
  },
}
