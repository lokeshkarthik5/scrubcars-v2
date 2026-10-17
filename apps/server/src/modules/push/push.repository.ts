import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notificationSends, pushSubscriptions, users } from '../../db/schema.js'
import type { PushAudience, ScheduledPushKind } from '../../lib/push.js'
import { NOT_IN_BIN } from '../vendors/vendors.predicates.js'

/** A subscription as the sender needs it: where to, and the keys. */
export type SubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** A booking the cron may send a scheduled notification for. */
export interface ScheduledCandidateRow {
  id: string
  userId: string
  vendorId: string
  status: string
  bookingType: string
  scheduledAt: Date
  createdAt: Date
  respondBy: Date | null
  paymentStatus: string | null
  hasOpenProposal: boolean
  businessName: string
  /** The booked services' names, in order. */
  serviceNames: string[]
}

const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value)

export const pushRepository = {
  /**
   * Stores this browser's subscription for this person (and garage), or
   * moves an existing one to them: one endpoint is one browser, and the
   * last person to turn notifications on in it is who it belongs to.
   */
  async upsertSubscription(input: {
    endpoint: string
    p256dh: string
    auth: string
    userId: string
    audience: PushAudience
    vendorId: string | null
    deviceLabel: string | null
  }) {
    const [row] = await db
      .insert(pushSubscriptions)
      .values(input)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: input.p256dh,
          auth: input.auth,
          userId: input.userId,
          audience: input.audience,
          vendorId: input.vendorId,
          deviceLabel: input.deviceLabel,
          failureCount: 0,
        },
      })
      .returning({ id: pushSubscriptions.id })
    return row
  },

  /**
   * Keeps the newest `keep` of a person's subscriptions for one app (and
   * garage); deletes the rest. Answers how many went.
   */
  async pruneSubscriptions(scope: { userId: string; audience: PushAudience; vendorId: string | null }, keep: number) {
    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(scopeWhere(scope))
      .orderBy(sql`${pushSubscriptions.createdAt} desc`, sql`${pushSubscriptions.id} desc`)
    const extra = rows.slice(keep).map((row) => row.id)
    if (extra.length === 0) return 0
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, extra))
    return extra.length
  },

  /** This browser's subscription, only if it is this person's (and garage's). */
  async findOwnSubscription(
    scope: { userId: string; audience: PushAudience; vendorId: string | null },
    endpoint: string
  ): Promise<SubscriptionRow | undefined> {
    const [row] = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(and(scopeWhere(scope), eq(pushSubscriptions.endpoint, endpoint)))
      .limit(1)
    return row
  },

  /** Deletes this browser's subscription if it is this person's; answers whether it was. */
  async deleteOwnSubscription(
    scope: { userId: string; audience: PushAudience; vendorId: string | null },
    endpoint: string
  ): Promise<boolean> {
    const rows = await db
      .delete(pushSubscriptions)
      .where(and(scopeWhere(scope), eq(pushSubscriptions.endpoint, endpoint)))
      .returning({ id: pushSubscriptions.id })
    return rows.length > 0
  },

  /** How many devices a person has turned on, for one app (and garage). */
  async countSubscriptions(scope: { userId: string; audience: PushAudience; vendorId: string | null }) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .where(scopeWhere(scope))
    return row?.count ?? 0
  },

  /**
   * A customer's devices and their two switches. Only an active account's;
   * a suspended one gets nothing.
   */
  async listCustomerSubscriptions(userId: string) {
    return db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        pushBookingUpdates: users.pushBookingUpdates,
        pushReminders: users.pushReminders,
      })
      .from(pushSubscriptions)
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.audience, 'customer'),
          eq(users.status, 'active')
        )
      )
  },

  /**
   * Every device of a garage's team: subscriptions turned on for this garage
   * by someone who still holds an active seat there (owner or operator),
   * while the garage is out of the Bin. A seat removed or suspended, or the
   * garage binned, and that device hears nothing more about it.
   */
  async listGarageSubscriptions(vendorId: string): Promise<SubscriptionRow[]> {
    const rows = await db.execute<SubscriptionRow>(sql`
      SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
        FROM push_subscriptions ps
        JOIN user_member_mapping m
          ON m.user_id = ps.user_id
         AND m.vendor_id = ps.vendor_id
         AND m.status = 'active'
         AND m.role IN ('vendor_admin', 'vendor_operator')
        JOIN vendors v ON v.id = ps.vendor_id
       WHERE ps.vendor_id = ${vendorId}
         AND ps.audience = 'garage'
         AND ${NOT_IN_BIN}
    `)
    return Array.from(rows)
  },

  async getPreferences(userId: string) {
    const [row] = await db
      .select({ pushBookingUpdates: users.pushBookingUpdates, pushReminders: users.pushReminders })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return row
  },

  async setPreferences(userId: string, set: { pushBookingUpdates?: boolean; pushReminders?: boolean }) {
    const [row] = await db
      .update(users)
      .set(set)
      .where(eq(users.id, userId))
      .returning({ pushBookingUpdates: users.pushBookingUpdates, pushReminders: users.pushReminders })
    return row
  },

  async markSent(id: string, at: Date) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: at, failureCount: 0 })
      .where(eq(pushSubscriptions.id, id))
  },

  /** One more failure in a row; answers the new count. */
  async markFailed(id: string): Promise<number> {
    const [row] = await db
      .update(pushSubscriptions)
      .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
      .where(eq(pushSubscriptions.id, id))
      .returning({ failureCount: pushSubscriptions.failureCount })
    return row?.failureCount ?? 0
  },

  async deleteSubscription(id: string) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
  },

  /**
   * Claims a scheduled notification for a booking. True only for the one
   * caller whose insert went in: a second run, at the same moment or later,
   * finds the row and sends nothing.
   */
  async claimScheduled(bookingId: string, kind: ScheduledPushKind): Promise<boolean> {
    const rows = await db
      .insert(notificationSends)
      .values({ bookingId, kind })
      .onConflictDoNothing({ target: [notificationSends.bookingId, notificationSends.kind] })
      .returning({ id: notificationSends.id })
    return rows.length > 0
  },

  /**
   * Bookings that may be due a scheduled notification of `kind` with
   * `column` (scheduled_at or respond_by) in (from, to], not yet sent, and
   * with someone to send it to: a customer device of an account with
   * reminders on, or for `respond_soon` a device of the garage. Oldest
   * first, at most `limit`. Only narrows: lib/push-reminders.ts decides.
   */
  async listScheduledCandidates(input: {
    kind: ScheduledPushKind
    from: Date
    to: Date
    limit: number
  }): Promise<ScheduledCandidateRow[]> {
    const column = input.kind === 'respond_soon' ? sql`b.respond_by` : sql`b.scheduled_at`
    const status = input.kind === 'respond_soon' ? sql`'pending'` : sql`'confirmed'`
    const audience =
      input.kind === 'respond_soon'
        ? sql`EXISTS (SELECT 1 FROM push_subscriptions ps
                       WHERE ps.vendor_id = b.vendor_id AND ps.audience = 'garage')`
        : sql`u.push_reminders AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM push_subscriptions ps
                           WHERE ps.user_id = b.user_id AND ps.audience = 'customer')`
    const rows = await db.execute<{
      id: string
      user_id: string
      vendor_id: string
      status: string
      booking_type: string
      scheduled_at: Date | string
      created_at: Date | string
      respond_by: Date | string | null
      payment_status: string | null
      has_open_proposal: boolean
      business_name: string
      service_names: string[] | null
    }>(sql`
      SELECT b.id, b.user_id, b.vendor_id, b.status::text AS status, b.booking_type::text AS booking_type,
             b.scheduled_at, b.created_at, b.respond_by,
             p.status::text AS payment_status,
             EXISTS (SELECT 1 FROM booking_time_proposals tp
                      WHERE tp.booking_id = b.id AND tp.status = 'open') AS has_open_proposal,
             v.business_name,
             (SELECT array_agg(bi.name ORDER BY bi.sort_order, bi.created_at)
                FROM booking_items bi WHERE bi.booking_id = b.id) AS service_names
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        JOIN vendors v ON v.id = b.vendor_id
        LEFT JOIN payments p ON p.booking_id = b.id
       WHERE b.status = ${status}
         AND ${column} > ${input.from.toISOString()}::timestamptz
         AND ${column} <= ${input.to.toISOString()}::timestamptz
         AND NOT EXISTS (SELECT 1 FROM notification_sends ns
                          WHERE ns.booking_id = b.id AND ns.kind = ${input.kind})
         AND ${audience}
       ORDER BY ${column} ASC, b.id ASC
       LIMIT ${input.limit}
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      userId: row.user_id,
      vendorId: row.vendor_id,
      status: row.status,
      bookingType: row.booking_type,
      scheduledAt: toDate(row.scheduled_at)!,
      createdAt: toDate(row.created_at)!,
      respondBy: toDate(row.respond_by),
      paymentStatus: row.payment_status,
      hasOpenProposal: row.has_open_proposal === true,
      businessName: row.business_name,
      serviceNames: row.service_names ?? [],
    }))
  },
}

function scopeWhere(scope: { userId: string; audience: PushAudience; vendorId: string | null }) {
  return and(
    eq(pushSubscriptions.userId, scope.userId),
    eq(pushSubscriptions.audience, scope.audience),
    scope.vendorId === null
      ? sql`${pushSubscriptions.vendorId} IS NULL`
      : eq(pushSubscriptions.vendorId, scope.vendorId)
  )
}
