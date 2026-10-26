import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  garageCars,
  garageCollections,
  garagePulls,
  garageRowCompletions,
  garageSeries,
  garageSeriesCompletions,
  rewardBadgeAwards,
  rewardBookings,
  rewardNudges,
  rewardStamps,
  users,
} from '../../db/schema.js'
import {
  duplicateStars,
  garageSettings,
  newlyCompletedRows,
  planPull,
  rowReward,
  seriesComplete,
  type ArtSource,
  type CarEdit,
  type GarageRarity,
  type PullForce,
  type PullSource,
  type SeriesStatus,
} from '../../lib/garage.js'
import { achievementSettings, istMonthKey, istMonthRange, stampExpiresAt, type RewardsSettings } from '../../lib/rewards.js'
import { rewardsTx, type IssuedVoucher } from '../rewards/rewards.repository.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = PgTransaction<any, any, any>
type Conn = typeof db | AnyTx

// ─── Locks ───────────────────────────────────────────────────────────────────
//
// Every write to a customer's Garage happens inside their rewards lock
// (`rewards:<userId>`, rewardsTx.lockRewards), taken by the caller: a
// booking's pull, a scratch card's, a challenge's or a badge's, the team's.
// So one booking never pulls twice, duplicates never turn into two stamps
// and a row is never rewarded twice. A row's voucher then takes
// `rewards:cap` (the month's budget), last. The team's edits to series and
// cars take no customer lock (they never touch a customer's rows).

// ─── Reads shared by the writes ──────────────────────────────────────────────

/** The live series now: status live and inside its dates. The newest if two. */
async function liveSeries(conn: Conn, now: Date) {
  const [row] = await (conn as typeof db)
    .select()
    .from(garageSeries)
    .where(
      and(
        eq(garageSeries.status, 'live'),
        or(isNull(garageSeries.startsAt), lte(garageSeries.startsAt, now)),
        or(isNull(garageSeries.endsAt), gt(garageSeries.endsAt, now))
      )
    )
    .orderBy(desc(garageSeries.number))
    .limit(1)
  return row ?? null
}

async function ownedOf(conn: Conn, userId: string, seriesId: string) {
  return (conn as typeof db)
    .select({ carId: garageCollections.carId, count: garageCollections.count, number: garageCars.number })
    .from(garageCollections)
    .innerJoin(garageCars, eq(garageCars.id, garageCollections.carId))
    .where(and(eq(garageCollections.userId, userId), eq(garageCollections.seriesId, seriesId)))
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface PulledCard {
  id: string
  carId: string
  number: number
  name: string
  rarity: GarageRarity
  duplicate: boolean
  forced: PullForce | null
  source: PullSource
}

export interface PullOutcome {
  userId: string
  seriesId: string
  seriesName: string
  pull: PulledCard
  /** Bonus stamps from duplicates. */
  duplicateStamps: number
  rows: Array<{ row: number; voucher: IssuedVoucher | null; stamps: number }>
  seriesCompleted: { badgeAwardId: string | null } | null
  vouchers: IssuedVoucher[]
  /** Stamps went on the card (duplicates, a row past the budget, the badge): full cards to convert. */
  stampsAdded: boolean
  /** A row's voucher fell back to stamps: the month reached its budget. */
  capHit: boolean
}

export interface PullInput {
  userId: string
  source: PullSource
  rootBookingId?: string | null
  scratchCardId?: string | null
  challengeId?: string | null
  badgeAwardId?: string | null
  actorName?: string | null
  reason?: string | null
  now: Date
  settings: RewardsSettings
  pick?: (max: number) => number
}

/** Bonus stamps from the Garage, each lapsing like any stamp. */
async function addGarageStamps(tx: AnyTx, input: { userId: string; pullId: string; count: number; now: Date; settings: RewardsSettings }) {
  if (input.count <= 0) return
  await tx.insert(rewardStamps).values(
    Array.from({ length: input.count }, () => ({
      userId: input.userId,
      source: 'garage' as const,
      garagePullId: input.pullId,
      earnedAt: input.now,
      expiresAt: stampExpiresAt(input.now, input.settings),
    }))
  )
}

/**
 * One pull, inside the caller's transaction and after it took the
 * customer's rewards lock: the rarity (pity first), the car (an unowned one
 * preferred), the collection, duplicates into stamps, finished rows (a
 * voucher within the month's budget, else stamps) and a finished series
 * (the Garage Legend badge). Null when the Garage is off, no series is
 * live, the series has no car switched on, or this booking or scratch card
 * already pulled (the partial unique indexes make it once, under any race).
 * Full Shine Cards and the cap alert are the caller's (`finishPulls`).
 */
async function pull(tx: AnyTx, input: PullInput): Promise<PullOutcome | null> {
  const g = garageSettings(input.settings)
  if (!g.enabled) return null
  const series = await liveSeries(tx, input.now)
  if (!series) return null
  const { userId, now, settings } = input

  const allCars = await tx
    .select({ id: garageCars.id, number: garageCars.number, rarity: garageCars.rarity, name: garageCars.name, enabled: garageCars.enabled })
    .from(garageCars)
    .where(eq(garageCars.seriesId, series.id))
  const cars = allCars.filter((car) => car.enabled)
  const owned = await ownedOf(tx, userId, series.id)
  const ownedIds = new Set(owned.map((row) => row.carId))
  const history = await tx
    .select({ rarity: garagePulls.rarity })
    .from(garagePulls)
    .where(and(eq(garagePulls.userId, userId), eq(garagePulls.seriesId, series.id)))
    .orderBy(desc(garagePulls.pulledAt), desc(garagePulls.id))
    .limit(Math.max(g.pityLegendary, g.pityRare))
  const plan = planPull({ cars, owned: ownedIds, history: history.map((row) => row.rarity) }, g, input.pick)
  if (!plan) return null

  const [row] = await tx
    .insert(garagePulls)
    .values({
      userId,
      seriesId: series.id,
      carId: plan.car.id,
      rarity: plan.rarity,
      source: input.source,
      rootBookingId: input.rootBookingId ?? null,
      scratchCardId: input.scratchCardId ?? null,
      challengeId: input.challengeId ?? null,
      badgeAwardId: input.badgeAwardId ?? null,
      actorName: input.actorName ?? null,
      reason: input.reason ?? null,
      forced: plan.forced,
      wasDuplicate: plan.duplicate,
      pulledAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: garagePulls.id })
  if (!row) return null

  await tx
    .insert(garageCollections)
    .values({ userId, carId: plan.car.id, seriesId: series.id, count: 1, firstPulledAt: now, lastPulledAt: now })
    .onConflictDoUpdate({
      target: [garageCollections.userId, garageCollections.carId],
      set: { count: sql`${garageCollections.count} + 1`, lastPulledAt: now },
    })

  const outcome: PullOutcome = {
    userId,
    seriesId: series.id,
    seriesName: series.name,
    pull: {
      id: row.id,
      carId: plan.car.id,
      number: plan.car.number,
      name: plan.car.name,
      rarity: plan.rarity,
      duplicate: plan.duplicate,
      forced: plan.forced,
      source: input.source,
    },
    duplicateStamps: 0,
    rows: [],
    seriesCompleted: null,
    vouchers: [],
    stampsAdded: false,
    capHit: false,
  }

  if (plan.duplicate) {
    // Every N duplicates not yet used make one bonus stamp; the oldest go first.
    const waiting = await tx
      .select({ id: garagePulls.id })
      .from(garagePulls)
      .where(and(eq(garagePulls.userId, userId), eq(garagePulls.wasDuplicate, true), isNull(garagePulls.convertedAt)))
      .orderBy(asc(garagePulls.pulledAt), asc(garagePulls.id))
    const stars = duplicateStars(waiting.length, g.duplicatesPerStar)
    if (stars.stamps > 0) {
      await tx
        .update(garagePulls)
        .set({ convertedAt: now })
        .where(inArray(garagePulls.id, waiting.slice(0, stars.used).map((p) => p.id)))
      await addGarageStamps(tx, { userId, pullId: row.id, count: stars.stamps, now, settings })
      outcome.duplicateStamps = stars.stamps
      outcome.stampsAdded = true
    }
    return outcome
  }

  // A new car: rows and the series may be finished now.
  const ownedNumbers = new Set([...owned.map((o) => o.number), plan.car.number])
  const seriesNumbers = cars.map((car) => car.number)
  const rewarded = await tx
    .select({ row: garageRowCompletions.row })
    .from(garageRowCompletions)
    .where(and(eq(garageRowCompletions.userId, userId), eq(garageRowCompletions.seriesId, series.id)))
  // Normally only the new car's row; any other row a car switched off since has finished goes too.
  const rows = newlyCompletedRows({ seriesNumbers, ownedNumbers, rewardedRows: new Set(rewarded.map((r) => r.row)) })
  for (const done of rows) {
    await rewardsTx.lockCap(tx)
    const issued = await rewardsTx.issuedInMonthPaise(tx, istMonthKey(now))
    const reward = rowReward({ issuedThisMonthPaise: issued, capPaise: settings.monthlyCap * 100 }, g)
    let voucher: IssuedVoucher | null = null
    let stamps = 0
    if (reward.kind === 'voucher') {
      const v = await rewardsTx.issueVoucher(tx, { userId, kind: 'garage_row', amount: reward.amount, now, settings, sourceBookingId: input.rootBookingId ?? null })
      voucher = { id: v.id, kind: v.kind, amount: v.amount, userId }
      outcome.vouchers.push(voucher)
    } else {
      stamps = reward.stamps
      outcome.capHit = true
      await addGarageStamps(tx, { userId, pullId: row.id, count: stamps, now, settings })
      if (stamps > 0) outcome.stampsAdded = true
    }
    const [inserted] = await tx
      .insert(garageRowCompletions)
      .values({ userId, seriesId: series.id, row: done, pullId: row.id, voucherId: voucher?.id ?? null, fallbackStamps: stamps, completedAt: now })
      .onConflictDoNothing()
      .returning({ id: garageRowCompletions.id })
    if (inserted) outcome.rows.push({ row: done, voucher, stamps })
  }

  if (seriesComplete(seriesNumbers, ownedNumbers)) {
    const [completion] = await tx
      .insert(garageSeriesCompletions)
      .values({ userId, seriesId: series.id, pullId: row.id, completedAt: now })
      .onConflictDoNothing()
      .returning({ id: garageSeriesCompletions.id })
    if (completion) {
      // The Garage Legend badge, when switched on, with its bonus stamps.
      const badge = achievementSettings(settings).garage_legend
      let badgeAwardId: string | null = null
      if (badge.enabled) {
        const [award] = await tx
          .insert(rewardBadgeAwards)
          .values({ userId, badgeKey: 'garage_legend', bonusStamps: badge.bonusStamps, rootBookingId: input.rootBookingId ?? null, earnedAt: now })
          .onConflictDoNothing()
          .returning({ id: rewardBadgeAwards.id })
        badgeAwardId = award?.id ?? null
        if (award && badge.bonusStamps > 0) {
          await tx.insert(rewardStamps).values(
            Array.from({ length: badge.bonusStamps }, () => ({
              userId,
              source: 'badge' as const,
              badgeAwardId: award.id,
              earnedAt: now,
              expiresAt: stampExpiresAt(now, settings),
            }))
          )
          outcome.stampsAdded = true
        }
        if (badgeAwardId) {
          await tx.update(garageSeriesCompletions).set({ badgeAwardId }).where(eq(garageSeriesCompletions.id, completion.id))
        }
      }
      outcome.seriesCompleted = { badgeAwardId }
    }
  }
  return outcome
}

/**
 * After the pulls of one transaction: full Shine Cards become vouchers, and
 * the month's budget is checked once (its alert once). Returns the extra
 * vouchers and the cap alert for the caller to announce.
 */
async function finishPulls(
  tx: AnyTx,
  input: { userId: string; outcomes: PullOutcome[]; now: Date; settings: RewardsSettings; sourceBookingId?: string | null }
): Promise<{ vouchers: IssuedVoucher[]; capAlert: { month: string; issuedPaise: number } | null }> {
  const vouchers = input.outcomes.flatMap((o) => o.vouchers)
  if (input.outcomes.some((o) => o.stampsAdded)) {
    vouchers.push(
      ...(await rewardsTx.convertFullCards(tx, { userId: input.userId, now: input.now, settings: input.settings, sourceBookingId: input.sourceBookingId }))
    )
  }
  const capHit = input.outcomes.some((o) => o.capHit)
  const capAlert = vouchers.length > 0 || capHit ? await rewardsTx.capCheck(tx, { now: input.now, settings: input.settings, forced: capHit }) : null
  return { vouchers, capAlert }
}

/** The pulls other rewards writes make inside their own transaction (a challenge's prize, a badge's bonus, a scratch card). */
export const garageTx = { pull, finishPulls }

export type GarageCarRow = typeof garageCars.$inferSelect
export type GarageSeriesRow = typeof garageSeries.$inferSelect

// ─── The repository ──────────────────────────────────────────────────────────

export const garageRepository = {
  liveSeries(now: Date) {
    return liveSeries(db, now)
  },

  /**
   * A booking's card: once per stamp-earning chain (still earned, not taken
   * back), under the customer's lock. Null when there is nothing to pull.
   */
  async pullForBooking(input: { userId: string; rootBookingId: string; now: Date; settings: RewardsSettings; pick?: (max: number) => number }) {
    return db.transaction(async (tx) => {
      await rewardsTx.lockRewards(tx, input.userId)
      const [earned] = await tx
        .select({ id: rewardBookings.rootBookingId })
        .from(rewardBookings)
        .where(
          and(
            eq(rewardBookings.rootBookingId, input.rootBookingId),
            eq(rewardBookings.userId, input.userId),
            eq(rewardBookings.earned, true),
            isNull(rewardBookings.revokedAt)
          )
        )
        .limit(1)
      if (!earned) return null
      const outcome = await pull(tx, { ...input, source: 'booking' })
      if (!outcome) return null
      const finished = await finishPulls(tx, { userId: input.userId, outcomes: [outcome], now: input.now, settings: input.settings, sourceBookingId: input.rootBookingId })
      return { outcomes: [outcome], ...finished }
    })
  },

  /** The team's card for a customer (a goodwill gesture or a fix): random like any pull, with the typed name and why, audit-logged. */
  async pullByAdmin(input: { userId: string; actorName: string; actorSub: string; reason: string; now: Date; settings: RewardsSettings }) {
    return db.transaction(async (tx) => {
      await rewardsTx.lockRewards(tx, input.userId)
      const outcome = await pull(tx, { userId: input.userId, source: 'admin', actorName: input.actorName, reason: input.reason, now: input.now, settings: input.settings })
      if (!outcome) return null
      const finished = await finishPulls(tx, { userId: input.userId, outcomes: [outcome], now: input.now, settings: input.settings })
      await tx.insert(adminAuditLog).values({
        action: 'garage_card_given',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { userId: input.userId, pullId: outcome.pull.id, car: outcome.pull.number, rarity: outcome.pull.rarity },
        detail: { reason: input.reason },
      })
      return { outcomes: [outcome], ...finished }
    })
  },

  /** Stamp-earning chains of the last `since` with no booking pull yet (the cron's catch-up). */
  async listUnpulled(since: Date, limit: number) {
    return db
      .select({ rootBookingId: rewardBookings.rootBookingId, userId: rewardBookings.userId })
      .from(rewardBookings)
      .where(
        and(
          eq(rewardBookings.earned, true),
          isNull(rewardBookings.revokedAt),
          gte(rewardBookings.judgedAt, since),
          sql`not exists (select 1 from garage_pulls p where p.root_booking_id = ${rewardBookings.rootBookingId} and p.source = 'booking')`
        )
      )
      .orderBy(asc(rewardBookings.judgedAt))
      .limit(limit)
  },

  /** Pulls, finished rows and series of the last `since` not yet told (no Garage nudge claimed): the cron's celebrations. */
  async listUntold(since: Date, limit: number) {
    const pulls = await db.execute<{ id: string; user_id: string; name: string; rarity: GarageRarity; was_duplicate: boolean }>(sql`
      select p.id, p.user_id, c.name, p.rarity, p.was_duplicate
        from garage_pulls p
        join garage_cars c on c.id = p.car_id
       where p.pulled_at >= ${since}
         and not exists (select 1 from reward_nudges n where n.user_id = p.user_id and n.kind = 'garage_card' and n.subject_key = 'garage_pull:' || p.id)
       order by p.pulled_at
       limit ${limit}
    `)
    const rows = await db.execute<{ id: string; user_id: string; series_id: string; row: number; voucher_amount: string | null; fallback_stamps: number }>(sql`
      select r.id, r.user_id, r.series_id, r.row, v.amount as voucher_amount, r.fallback_stamps
        from garage_row_completions r
        left join reward_vouchers v on v.id = r.voucher_id
       where r.completed_at >= ${since}
         and not exists (select 1 from reward_nudges n where n.user_id = r.user_id and n.kind = 'garage_row' and n.subject_key = 'garage_row:' || r.series_id || ':' || r.row)
       order by r.completed_at
       limit ${limit}
    `)
    const series = await db.execute<{ user_id: string; series_id: string; name: string }>(sql`
      select sc.user_id, sc.series_id, s.name
        from garage_series_completions sc
        join garage_series s on s.id = sc.series_id
       where sc.completed_at >= ${since}
         and not exists (select 1 from reward_nudges n where n.user_id = sc.user_id and n.kind = 'garage_series' and n.subject_key = 'garage_series:' || sc.series_id)
       limit ${limit}
    `)
    return {
      pulls: Array.from(pulls).map((p) => ({ id: p.id, userId: p.user_id, name: p.name, rarity: p.rarity, duplicate: p.was_duplicate })),
      rows: Array.from(rows).map((r) => ({
        userId: r.user_id,
        seriesId: r.series_id,
        row: Number(r.row),
        voucherAmount: r.voucher_amount === null ? null : Number(r.voucher_amount),
        stamps: Number(r.fallback_stamps),
      })),
      series: Array.from(series).map((s) => ({ userId: s.user_id, seriesId: s.series_id, name: s.name })),
    }
  },

  // ─── The customer ─────────────────────────────────────────────────────────

  async seriesCars(seriesId: string) {
    return db.select().from(garageCars).where(eq(garageCars.seriesId, seriesId)).orderBy(asc(garageCars.number))
  },

  /** The customer's album facts for a series: owned counts, rows rewarded, the series, duplicates waiting. */
  async albumFacts(userId: string, seriesId: string) {
    const owned = await db
      .select({ carId: garageCollections.carId, count: garageCollections.count, firstPulledAt: garageCollections.firstPulledAt })
      .from(garageCollections)
      .where(and(eq(garageCollections.userId, userId), eq(garageCollections.seriesId, seriesId)))
    const rows = await db
      .select({ row: garageRowCompletions.row, completedAt: garageRowCompletions.completedAt, voucherId: garageRowCompletions.voucherId, fallbackStamps: garageRowCompletions.fallbackStamps })
      .from(garageRowCompletions)
      .where(and(eq(garageRowCompletions.userId, userId), eq(garageRowCompletions.seriesId, seriesId)))
    const [completed] = await db
      .select({ completedAt: garageSeriesCompletions.completedAt })
      .from(garageSeriesCompletions)
      .where(and(eq(garageSeriesCompletions.userId, userId), eq(garageSeriesCompletions.seriesId, seriesId)))
      .limit(1)
    const [dupes] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(garagePulls)
      .where(and(eq(garagePulls.userId, userId), eq(garagePulls.wasDuplicate, true), isNull(garagePulls.convertedAt)))
    const [pulls] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(garagePulls)
      .where(and(eq(garagePulls.userId, userId), eq(garagePulls.seriesId, seriesId)))
    return { owned, rows, completedAt: completed?.completedAt ?? null, duplicatesWaiting: dupes?.n ?? 0, pulls: pulls?.n ?? 0 }
  },

  /** The customer's latest pulls (unseen first), with each car and what the pull finished. Bounded. */
  async recentPulls(userId: string, limit: number, only?: { scratchCardId: string }) {
    const rows = await db.execute<{
      id: string
      pulled_at: Date | string
      seen_at: Date | string | null
      source: PullSource
      was_duplicate: boolean
      root_booking_id: string | null
      booking_id: string | null
      car_id: string
      series_number: number
      series_total: number
      count: number | null
      row_completed: number | null
      row_voucher: string | null
      row_stamps: number | null
      series_completed: boolean
    }>(sql`
      select p.id, p.pulled_at, p.seen_at, p.source, p.was_duplicate, p.root_booking_id, rb.booking_id, p.car_id,
             s.number as series_number,
             (select count(*)::int from garage_cars c2 where c2.series_id = p.series_id) as series_total,
             col.count,
             rc.row as row_completed, v.amount as row_voucher, rc.fallback_stamps as row_stamps,
             exists (select 1 from garage_series_completions sc where sc.pull_id = p.id) as series_completed
        from garage_pulls p
        join garage_series s on s.id = p.series_id
        left join reward_bookings rb on rb.root_booking_id = p.root_booking_id
        left join garage_collections col on col.user_id = p.user_id and col.car_id = p.car_id
        left join garage_row_completions rc on rc.pull_id = p.id
        left join reward_vouchers v on v.id = rc.voucher_id
       where p.user_id = ${userId}
         ${only ? sql`and p.scratch_card_id = ${only.scratchCardId}` : sql``}
       order by (p.seen_at is null) desc, p.pulled_at desc
       limit ${limit}
    `)
    const list = Array.from(rows)
    const carIds = [...new Set(list.map((r) => r.car_id))]
    const cars = carIds.length > 0 ? await db.select().from(garageCars).where(inArray(garageCars.id, carIds)) : []
    const byId = new Map(cars.map((c) => [c.id, c]))
    return list.map((r) => ({
      id: r.id,
      pulledAt: new Date(r.pulled_at),
      seenAt: r.seen_at ? new Date(r.seen_at) : null,
      source: r.source,
      wasDuplicate: r.was_duplicate,
      rootBookingId: r.root_booking_id,
      bookingId: r.booking_id,
      seriesNumber: Number(r.series_number),
      seriesTotal: Number(r.series_total),
      count: Number(r.count ?? 1),
      rowCompleted: r.row_completed === null ? null : { row: Number(r.row_completed), voucherAmount: r.row_voucher === null ? null : Number(r.row_voucher), stamps: Number(r.row_stamps ?? 0) },
      seriesCompleted: r.series_completed,
      car: byId.get(r.car_id)!,
    }))
  },

  /** Marks the session's own pulls seen (never anyone else's). */
  async markSeen(userId: string, ids: string[], now: Date) {
    if (ids.length === 0) return 0
    const rows = await db
      .update(garagePulls)
      .set({ seenAt: now })
      .where(and(eq(garagePulls.userId, userId), inArray(garagePulls.id, ids), isNull(garagePulls.seenAt)))
      .returning({ id: garagePulls.id })
    return rows.length
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  listSeries() {
    return db.select().from(garageSeries).orderBy(desc(garageSeries.number))
  },

  async findSeries(id: string) {
    const [row] = await db.select().from(garageSeries).where(eq(garageSeries.id, id)).limit(1)
    return row ?? null
  },

  async findCar(id: string) {
    const [row] = await db
      .select({ car: garageCars, seriesNumber: garageSeries.number })
      .from(garageCars)
      .innerJoin(garageSeries, eq(garageSeries.id, garageCars.seriesId))
      .where(eq(garageCars.id, id))
      .limit(1)
    return row ?? null
  },

  /** Saves a series' name, status and dates with the audit row, in one transaction. */
  async updateSeries(input: {
    id: string
    patch: { name: string; status: SeriesStatus; startsAt: Date | null; endsAt: Date | null }
    actorName: string
    actorSub: string
    now: Date
  }) {
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(garageSeries).where(eq(garageSeries.id, input.id)).for('update').limit(1)
      if (!before) return null
      const [after] = await tx
        .update(garageSeries)
        .set({ ...input.patch, updatedAt: input.now, updatedBy: input.actorName })
        .where(eq(garageSeries.id, input.id))
        .returning()
      await tx.insert(adminAuditLog).values({
        action: 'garage_series_updated',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { seriesId: input.id, number: before.number },
        detail: {
          before: { name: before.name, status: before.status, startsAt: before.startsAt, endsAt: before.endsAt },
          after: input.patch,
        },
      })
      return after
    })
  },

  /** Saves a car's words, rarity, look and switch with the audit row. */
  async updateCar(input: { id: string; patch: CarEdit; actorName: string; actorSub: string; now: Date }) {
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(garageCars).where(eq(garageCars.id, input.id)).for('update').limit(1)
      if (!before) return null
      const [after] = await tx
        .update(garageCars)
        .set({ ...input.patch, updatedAt: input.now, updatedBy: input.actorName })
        .where(eq(garageCars.id, input.id))
        .returning()
      const changed = (Object.keys(input.patch) as Array<keyof CarEdit>).filter(
        (key) => JSON.stringify(before[key]) !== JSON.stringify(input.patch[key])
      )
      await tx.insert(adminAuditLog).values({
        action: 'garage_car_updated',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { carId: input.id, number: before.number, changed },
        detail: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, input.patch[k]])) },
      })
      return after
    })
  },

  /** A car's picture changed (an upload, or back to its pool photo), with the audit row. */
  async setArt(input: { id: string; source: ArtSource; url: string | null; actorName: string; actorSub: string; now: Date }) {
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(garageCars).where(eq(garageCars.id, input.id)).for('update').limit(1)
      if (!before) return null
      const [after] = await tx
        .update(garageCars)
        .set({ artSource: input.source, artUrl: input.url, artUpdatedAt: input.now, artUpdatedBy: input.actorName })
        .where(eq(garageCars.id, input.id))
        .returning()
      await tx.insert(adminAuditLog).values({
        action: 'garage_art_changed',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { carId: input.id, number: before.number, from: before.artSource, to: input.source },
        detail: {},
      })
      return after
    })
  },

  /** Per car: copies pulled and customers who own it. */
  async carFigures(seriesId: string) {
    const rows = await db.execute<{ car_id: string; pulls: number; owners: number }>(sql`
      select c.id as car_id,
             (select count(*)::int from garage_pulls p where p.car_id = c.id) as pulls,
             (select count(*)::int from garage_collections col where col.car_id = c.id) as owners
        from garage_cars c
       where c.series_id = ${seriesId}
    `)
    return new Map(Array.from(rows).map((r) => [r.car_id, { pulls: Number(r.pulls), owners: Number(r.owners) }]))
  },

  /** A month's figures: pulls by rarity and source, duplicates, stamps, rows and series finished, top collectors. */
  async monthStats(seriesId: string, monthKey: string) {
    const { start, end } = istMonthRange(monthKey)
    const byRarity = await db.execute<{ rarity: GarageRarity; n: number; forced: number }>(sql`
      select rarity, count(*)::int as n, count(*) filter (where forced is not null)::int as forced
        from garage_pulls where series_id = ${seriesId} and pulled_at >= ${start} and pulled_at < ${end}
       group by rarity
    `)
    const bySource = await db.execute<{ source: PullSource; n: number }>(sql`
      select source, count(*)::int as n
        from garage_pulls where series_id = ${seriesId} and pulled_at >= ${start} and pulled_at < ${end}
       group by source
    `)
    const [dupes] = await db.execute<{ n: number; converted: number }>(sql`
      select count(*) filter (where was_duplicate)::int as n, count(*) filter (where converted_at is not null)::int as converted
        from garage_pulls where series_id = ${seriesId} and pulled_at >= ${start} and pulled_at < ${end}
    `)
    const [stamps] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from reward_stamps where source = 'garage' and earned_at >= ${start} and earned_at < ${end}
    `)
    const rows = await db.execute<{ row: number; n: number; vouchers: number; amount: string | null }>(sql`
      select r.row, count(*)::int as n, count(r.voucher_id)::int as vouchers, sum(v.amount) as amount
        from garage_row_completions r left join reward_vouchers v on v.id = r.voucher_id
       where r.series_id = ${seriesId} and r.completed_at >= ${start} and r.completed_at < ${end}
       group by r.row order by r.row
    `)
    const [series] = await db.execute<{ month: number; ever: number }>(sql`
      select count(*) filter (where completed_at >= ${start} and completed_at < ${end})::int as month, count(*)::int as ever
        from garage_series_completions where series_id = ${seriesId}
    `)
    const [collectors] = await db.execute<{ n: number }>(sql`
      select count(distinct user_id)::int as n from garage_collections where series_id = ${seriesId}
    `)
    return {
      byRarity: Array.from(byRarity).map((r) => ({ rarity: r.rarity, n: Number(r.n), forced: Number(r.forced) })),
      bySource: Array.from(bySource).map((r) => ({ source: r.source, n: Number(r.n) })),
      duplicates: Number(dupes?.n ?? 0),
      converted: Number(dupes?.converted ?? 0),
      garageStamps: Number(stamps?.n ?? 0),
      rows: Array.from(rows).map((r) => ({ row: Number(r.row), n: Number(r.n), vouchers: Number(r.vouchers), amount: r.amount ?? '0.00' })),
      seriesThisMonth: Number(series?.month ?? 0),
      seriesEver: Number(series?.ever ?? 0),
      collectors: Number(collectors?.n ?? 0),
    }
  },

  async topCollectors(seriesId: string, limit: number) {
    const rows = await db.execute<{ user_id: string; name: string; phone: string; cars: number; copies: number; completed: boolean }>(sql`
      select col.user_id, u.name, u.phone, count(*)::int as cars, sum(col.count)::int as copies,
             exists (select 1 from garage_series_completions sc where sc.user_id = col.user_id and sc.series_id = ${seriesId}) as completed
        from garage_collections col join users u on u.id = col.user_id
       where col.series_id = ${seriesId}
       group by col.user_id, u.name, u.phone
       order by cars desc, copies desc
       limit ${limit}
    `)
    return Array.from(rows).map((r) => ({ userId: r.user_id, name: r.name, phone: r.phone, cars: Number(r.cars), copies: Number(r.copies), completed: r.completed }))
  },

  /** Every pull of a month, for the CSV (phones masked by the service). Bounded. */
  async monthPulls(monthKey: string, limit: number) {
    const { start, end } = istMonthRange(monthKey)
    const rows = await db.execute<{
      pulled_at: Date | string
      phone: string
      series: number
      number: number
      name: string
      rarity: GarageRarity
      source: PullSource
      was_duplicate: boolean
      forced: PullForce | null
    }>(sql`
      select p.pulled_at, u.phone, s.number as series, c.number, c.name, p.rarity, p.source, p.was_duplicate, p.forced
        from garage_pulls p
        join users u on u.id = p.user_id
        join garage_cars c on c.id = p.car_id
        join garage_series s on s.id = p.series_id
       where p.pulled_at >= ${start} and p.pulled_at < ${end}
       order by p.pulled_at
       limit ${limit}
    `)
    return Array.from(rows).map((r) => ({ ...r, pulled_at: new Date(r.pulled_at), series: Number(r.series), number: Number(r.number) }))
  },

  findCustomer(userId: string) {
    return db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true } })
  },

  /** Whether a pull was already told (its Garage nudge claimed). */
  async told(userId: string, kind: 'garage_card' | 'garage_row' | 'garage_series', subjectKey: string) {
    const [row] = await db
      .select({ id: rewardNudges.id })
      .from(rewardNudges)
      .where(and(eq(rewardNudges.userId, userId), eq(rewardNudges.kind, kind), eq(rewardNudges.subjectKey, subjectKey)))
      .limit(1)
    return Boolean(row)
  },

}
