import { randomInt } from 'node:crypto'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { discounts, garageRecommendations, zoneSignups, zones } from '../../db/schema.js'
import { DEFAULT_DOORSTEP_RADIUS_KM } from '../../lib/doorstep.js'
import { DEFAULT_PICKUP_RADIUS_KM } from '../../lib/pickup.js'
import { FREE_WASH_RULES } from '../../lib/area-signups.js'
import { DISCOUNT_HELD } from '../discounts/discounts.predicates.js'
import { insertReferralRewardLot } from '../gift-credit/gift-credit.repository.js'
import { LISTED_TO_CUSTOMERS, PICKUP_OFFERED } from '../vendors/vendors.predicates.js'

export type ZoneRecord = typeof zones.$inferSelect
export type ZoneSignupRecord = typeof zoneSignups.$inferSelect
export type RecommendationRecord = typeof garageRecommendations.$inferSelect

/** Free-wash codes: FW- and eight of the no-look-alike letters. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function freeWashCode(): string {
  let code = 'FW-'
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  return code
}

export const areaSignupsRepository = {
  listZones() {
    return db.select().from(zones).orderBy(sql`${zones.priority} DESC`, asc(zones.name))
  },

  findZoneBySlug(slug: string) {
    return db.query.zones.findFirst({ where: eq(zones.slug, slug) })
  },

  /** The pins of every garage customers can find, for which zones have one (lib/zones.ts). */
  async listListedGaragePins(): Promise<Array<{ id: string; lat: number; lng: number }>> {
    const rows = await db.execute<{ id: string; lat: number; lng: number }>(sql`
      SELECT v.id, v.lat, v.lng FROM vendors v
       WHERE ${LISTED_TO_CUSTOMERS} AND v.lat IS NOT NULL AND v.lng IS NOT NULL
    `)
    return Array.from(rows).map((row) => ({ id: row.id, lat: Number(row.lat), lng: Number(row.lng) }))
  },

  /** How many sign-ups each zone has. */
  async countsByZone(): Promise<Map<string, number>> {
    const rows = await db
      .select({ zoneId: zoneSignups.zoneId, count: sql<number>`count(*)::int` })
      .from(zoneSignups)
      .groupBy(zoneSignups.zoneId)
    return new Map(rows.map((row) => [row.zoneId, Number(row.count)]))
  },

  /**
   * A sign-up, its place counted under the zone's own lock
   * (`zone-signups:<zoneId>`, taken on its own), so two at once never share
   * a place and the 50th is the 50th. Null when the customer is already on
   * this zone's list.
   */
  signUp(input: {
    userId: string
    zoneId: string
    pushOptIn: boolean
    whatsappOptIn: boolean
    now: Date
    freeWashFor: (position: number) => boolean
  }): Promise<ZoneSignupRecord | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`zone-signups:${input.zoneId}`})::bigint)`)
      const [existing] = await tx
        .select({ id: zoneSignups.id })
        .from(zoneSignups)
        .where(and(eq(zoneSignups.userId, input.userId), eq(zoneSignups.zoneId, input.zoneId)))
        .limit(1)
      if (existing) return null
      const [last] = await tx
        .select({ max: sql<number | null>`max(${zoneSignups.position})` })
        .from(zoneSignups)
        .where(eq(zoneSignups.zoneId, input.zoneId))
      const position = Number(last?.max ?? 0) + 1
      const [row] = await tx
        .insert(zoneSignups)
        .values({
          userId: input.userId,
          zoneId: input.zoneId,
          position,
          freeWash: input.freeWashFor(position),
          pushOptIn: input.pushOptIn,
          whatsappOptIn: input.whatsappOptIn,
          whatsappOptInAt: input.whatsappOptIn ? input.now : null,
        })
        .returning()
      return row ?? null
    })
  },

  /** Marks a sign-up already reached by a doorstep or pickup garage: nothing to tell later. */
  async markCoverageKnown(id: string, now: Date) {
    await db.update(zoneSignups).set({ coveragePushAt: now }).where(and(eq(zoneSignups.id, id), isNull(zoneSignups.coveragePushAt)))
  },

  /** A customer's sign-ups, with their zone, newest first. */
  listForCustomer(userId: string) {
    return db
      .select({ signup: zoneSignups, zone: zones })
      .from(zoneSignups)
      .innerJoin(zones, eq(zones.id, zoneSignups.zoneId))
      .where(eq(zoneSignups.userId, userId))
      .orderBy(sql`${zoneSignups.createdAt} DESC`)
  },

  /** Free washes issued to these codes that are still unused (no live booking holds them). */
  async unusedDiscounts(discountIds: readonly string[]) {
    if (discountIds.length === 0) return []
    return db
      .select({
        id: discounts.id,
        code: discounts.code,
        amountOff: discounts.amountOff,
        endsAt: discounts.endsAt,
        isActive: discounts.isActive,
        held: sql<number>`(
          SELECT count(*)::int FROM discount_redemptions dr
            JOIN bookings ON bookings.id = dr.booking_id
            JOIN payments ON payments.booking_id = bookings.id
           WHERE dr.discount_id = ${discounts.id} AND ${DISCOUNT_HELD}
        )`,
      })
      .from(discounts)
      .where(inArray(discounts.id, [...discountIds]))
  },

  /** Home's launch banner, seen: once, conditional on not seen. */
  async markBannerSeen(userId: string, zoneId: string, now: Date) {
    const rows = await db
      .update(zoneSignups)
      .set({ launchBannerSeenAt: now })
      .where(and(eq(zoneSignups.userId, userId), eq(zoneSignups.zoneId, zoneId), isNull(zoneSignups.launchBannerSeenAt)))
      .returning({ id: zoneSignups.id })
    return rows.length > 0
  },

  /**
   * Launch day for one zone, in one transaction: `live_at` set only if still
   * null (so a second run, or a second instance, does nothing), then a free
   * wash issued to each of the first 50 sign-ups not issued one: a
   * Detlio-funded code, car washes only, ₹499 at most, ending 30 days from
   * now. Null when the zone was already live.
   */
  launchZone(input: {
    zoneId: string
    now: Date
    endsAt: Date
    pick: (signups: ZoneSignupRecord[]) => ZoneSignupRecord[]
  }): Promise<{ zone: ZoneRecord; issued: number } | null> {
    return db.transaction(async (tx) => {
      const [zone] = await tx
        .update(zones)
        .set({ liveAt: input.now, updatedAt: input.now })
        .where(and(eq(zones.id, input.zoneId), isNull(zones.liveAt)))
        .returning()
      if (!zone) return null
      const signups = await tx
        .select()
        .from(zoneSignups)
        .where(eq(zoneSignups.zoneId, input.zoneId))
        .orderBy(asc(zoneSignups.position))
        .for('update')
      let issued = 0
      for (const signup of input.pick(signups)) {
        let discountId: string | null = null
        // A clash on the code (one in ~10^11) just tries again.
        for (let attempt = 0; attempt < 5 && !discountId; attempt++) {
          const inserted = await tx
            .insert(discounts)
            .values({
              code: freeWashCode(),
              description: `Free wash: ${zone.name} launch`,
              discountType: 'fixed',
              amountOff: FREE_WASH_RULES.maxRupees.toFixed(2),
              perUserLimit: 1,
              totalUsageLimit: 1,
              fundedBy: 'platform',
              startsAt: input.now,
              endsAt: input.endsAt,
              isActive: true,
              source: 'free_wash',
              serviceCategory: FREE_WASH_RULES.category,
            })
            .onConflictDoNothing()
            .returning({ id: discounts.id })
          discountId = inserted[0]?.id ?? null
        }
        if (!discountId) throw new Error('free_wash:code_clash')
        await tx
          .update(zoneSignups)
          .set({ discountId, freeWashIssuedAt: input.now })
          .where(and(eq(zoneSignups.id, signup.id), isNull(zoneSignups.discountId)))
        issued++
      }
      return { zone, issued }
    })
  },

  /**
   * Sign-ups that may be due a message: not yet told of a live zone, or
   * (zone not live) not yet told of a garage that now reaches them or
   * reminded. Oldest first, a bounded batch.
   */
  listMessageCandidates(limit: number) {
    return db
      .select({ signup: zoneSignups, zone: zones })
      .from(zoneSignups)
      .innerJoin(zones, eq(zones.id, zoneSignups.zoneId))
      .where(
        sql`(${zones.liveAt} IS NOT NULL AND ${zoneSignups.launchPushAt} IS NULL)
          OR (${zones.liveAt} IS NULL AND (${zoneSignups.coveragePushAt} IS NULL OR ${zoneSignups.reminderPushAt} IS NULL))`
      )
      .orderBy(asc(zoneSignups.createdAt))
      .limit(limit)
  },

  /**
   * Claims one message for a sign-up (its marker, conditional on not set),
   * so overlapping runs never send twice. True when this call claimed it.
   */
  async claimMessage(id: string, kind: 'launch' | 'coverage' | 'reminder', now: Date): Promise<boolean> {
    const column =
      kind === 'launch' ? zoneSignups.launchPushAt : kind === 'coverage' ? zoneSignups.coveragePushAt : zoneSignups.reminderPushAt
    const set =
      kind === 'launch' ? { launchPushAt: now } : kind === 'coverage' ? { coveragePushAt: now } : { reminderPushAt: now }
    const rows = await db
      .update(zoneSignups)
      .set(set)
      .where(and(eq(zoneSignups.id, id), isNull(column)))
      .returning({ id: zoneSignups.id })
    return rows.length > 0
  },

  /**
   * The nearest listed doorstep or pickup garage that reaches a point (a
   * zone's centre), by the booking checks' own rules; null when none does.
   */
  async garageReaching(point: { lat: number; lng: number }): Promise<{ name: string; mode: 'doorstep' | 'pickup' } | null> {
    const at = sql`gis.ST_SetSRID(gis.ST_MakePoint(${point.lng}, ${point.lat}), 4326)::gis.geography`
    const rows = await db.execute<{ name: string; mode: 'doorstep' | 'pickup' }>(sql`
      SELECT v.business_name AS name,
             CASE WHEN v.doorstep_enabled = true AND (CASE
                    WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ${at})
                    ELSE gis.ST_DWithin(v.geo, ${at}, COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000, false)
                  END) THEN 'doorstep' ELSE 'pickup' END AS mode
        FROM vendors v
       WHERE ${LISTED_TO_CUSTOMERS} AND v.geo IS NOT NULL
         AND (
           (v.doorstep_enabled = true AND (CASE
              WHEN v.doorstep_area IS NOT NULL THEN gis.ST_Covers(v.doorstep_area, ${at})
              ELSE gis.ST_DWithin(v.geo, ${at}, COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000, false)
            END))
           OR (${PICKUP_OFFERED} AND gis.ST_DWithin(v.geo, ${at}, COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000, false))
         )
       ORDER BY gis.ST_Distance(v.geo, ${at}) ASC, v.id ASC
       LIMIT 1
    `)
    return Array.from(rows)[0] ?? null
  },

  // ─── Recommendations ───────────────────────────────────────────────────────

  insertRecommendation(values: typeof garageRecommendations.$inferInsert) {
    return db.insert(garageRecommendations).values(values).returning()
  },

  /** Recommendations the team linked to a garage, with no credit decided yet, or owed. */
  listCreditCandidates(limit: number) {
    return db
      .select()
      .from(garageRecommendations)
      .where(
        and(
          isNotNull(garageRecommendations.vendorId),
          isNotNull(garageRecommendations.userId),
          sql`(${garageRecommendations.creditStatus} IS NULL OR ${garageRecommendations.creditStatus} = 'owed')`
        )
      )
      .orderBy(asc(garageRecommendations.updatedAt))
      .limit(limit)
  },

  /** A recommendation checked with nothing to do yet: to the back of the queue. */
  async touchRecommendation(id: string, now: Date) {
    await db.update(garageRecommendations).set({ updatedAt: now }).where(eq(garageRecommendations.id, id))
  },

  /** Whether the garage is listed to customers now. */
  async garageListed(vendorId: string): Promise<boolean> {
    const rows = await db.execute<{ id: string }>(sql`SELECT v.id FROM vendors v WHERE v.id = ${vendorId} AND ${LISTED_TO_CUSTOMERS}`)
    return Array.from(rows).length > 0
  },

  /**
   * The customer's first completed booking at the garage made after the
   * recommendation, whose money landed and was kept (not Test-marked, not a
   * free redo, nothing refunded): what earns the credit.
   */
  async firstPaidCompletedBooking(userId: string, vendorId: string, since: Date): Promise<string | null> {
    const rows = await db.execute<{ id: string }>(sql`
      SELECT b.id FROM bookings b
        JOIN payments p ON p.booking_id = b.id
       WHERE b.user_id = ${userId} AND b.vendor_id = ${vendorId}
         AND b.status = 'completed'
         AND b.created_at >= ${since.toISOString()}::timestamptz
         AND b.marked_test_at IS NULL
         AND NOT b.guarantee_redo
         AND b.guarantee_refund_at IS NULL
         AND p.status IN ('paid', 'collected')
         AND COALESCE(p.refunded_amount, 0) = 0
       ORDER BY b.completed_at ASC NULLS LAST, b.id ASC
       LIMIT 1
    `)
    return Array.from(rows)[0]?.id ?? null
  },

  /**
   * Decides one recommendation's credit under the customer's own lock
   * (`garage-recommendations:<userId>`, taken on its own; then the credit
   * lock inside the ledger insert): `decide` reads what the customer has had
   * and what this garage has had, and says how much (or nothing). Granted
   * when credit is on, else owed (the cron grants it once it is on).
   */
  creditRecommendation(input: {
    id: string
    userId: string
    vendorId: string
    bookingId: string
    creditOn: boolean
    now: Date
    decide: (facts: { creditedSoFarRupees: number; alreadyForGarage: boolean }) => number | null
    reason: string
  }): Promise<RecommendationRecord | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`garage-recommendations:${input.userId}`})::bigint)`)
      const [row] = await tx
        .select()
        .from(garageRecommendations)
        .where(eq(garageRecommendations.id, input.id))
        .for('update')
        .limit(1)
      if (!row || row.userId !== input.userId || row.vendorId !== input.vendorId) return null
      if (row.creditStatus === 'granted') return null

      let amountRupees: number
      if (row.creditStatus === 'owed') {
        amountRupees = Number(row.creditAmount)
      } else {
        const [totals] = await tx
          .select({
            total: sql<string>`coalesce(sum(${garageRecommendations.creditAmount}), 0)`,
            forGarage: sql<number>`count(*) filter (where ${garageRecommendations.vendorId} = ${input.vendorId})::int`,
          })
          .from(garageRecommendations)
          .where(and(eq(garageRecommendations.userId, input.userId), isNotNull(garageRecommendations.creditStatus)))
        const decided = input.decide({
          creditedSoFarRupees: Number(totals?.total ?? 0),
          alreadyForGarage: Number(totals?.forGarage ?? 0) > 0,
        })
        if (decided === null) return null
        amountRupees = decided
      }

      if (!input.creditOn) {
        if (row.creditStatus === 'owed') return null
        const [owed] = await tx
          .update(garageRecommendations)
          .set({
            creditStatus: 'owed',
            creditAmount: amountRupees.toFixed(2),
            creditBookingId: input.bookingId,
            updatedAt: input.now,
          })
          .where(eq(garageRecommendations.id, row.id))
          .returning()
        return owed ?? null
      }
      const entry = await insertReferralRewardLot(tx, {
        userId: input.userId,
        amountPaise: Math.round(amountRupees * 100),
        reason: input.reason,
        now: input.now,
      })
      const [granted] = await tx
        .update(garageRecommendations)
        .set({
          creditStatus: 'granted',
          creditAmount: amountRupees.toFixed(2),
          creditEntryId: entry.id,
          creditBookingId: input.bookingId,
          creditedAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(garageRecommendations.id, row.id))
        .returning()
      return granted ?? null
    })
  },
}
