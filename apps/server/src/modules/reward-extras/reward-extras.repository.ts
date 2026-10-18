import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  rewardBadgeAwards,
  rewardBadgeChecks,
  rewardBookings,
  rewardChallengeBookings,
  rewardChallengeWinners,
  rewardChallenges,
  rewardStamps,
  rewardWrapped,
} from '../../db/schema.js'
import { badgesToAward, CHALLENGE_BADGE_KEY, type BadgeBooking, type BadgeFacts } from '../../lib/achievements.js'
import {
  bookingCounts,
  challengeOutcome,
  inAudience,
  multiplierExtra,
  oneLeftDue,
  type Challenge,
  type ChallengeInput,
} from '../../lib/challenges.js'
import { istDateKey } from '../../lib/ist.js'
import {
  CELEBRATORY_NUDGE_KINDS,
  levelFor,
  monthsBefore,
  paise,
  rupees,
  stampExpiresAt,
  type BadgeKey,
  type BadgeSettings,
  type RewardLevel,
  type RewardsSettings,
} from '../../lib/rewards.js'
import { yearRange, type WrappedBooking, type WrappedStats } from '../../lib/wrapped.js'
import { bookingCategories } from '../car-history/car-history.repository.js'
import { DISCOUNT_HELD } from '../discounts/discounts.predicates.js'
import { rewardsTx, type IssuedVoucher } from '../rewards/rewards.repository.js'
import { garageTx, type PullOutcome } from '../garage/garage.repository.js'
import { garageSettings } from '../../lib/garage.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = PgTransaction<any, any, any>
type Conn = typeof db | AnyTx

// ─── Locks ───────────────────────────────────────────────────────────────────
//
// Every write here takes the customer's `rewards:<userId>` first (0050's
// lock, rewardsTx.lockRewards), so a badge or a win is given once however
// many completions, cron runs and retries race. A win then takes
// `rewards-challenge:<id>`, so two customers never both take the last
// prize; the team's publish, edit and end take that lock on its own. Order:
// rewards:<user> → rewards-challenge:<id> (in id order) → rewards:cap.

async function lockChallenge(tx: AnyTx, challengeId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rewards-challenge:${challengeId}`})::bigint)`)
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

type ChallengeRow = typeof rewardChallenges.$inferSelect

export function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: String(row.startDate),
    endDate: String(row.endDate),
    goalCount: row.goalCount,
    category: row.category,
    bookingType: row.bookingType,
    rewardKind: row.rewardKind,
    rewardStamps: row.rewardStamps,
    rewardAmount: row.rewardAmount === null ? null : Number(row.rewardAmount),
    rewardMultiplier: row.rewardMultiplier,
    rewardCards: row.rewardCards,
    audienceMinLevel: row.audienceMinLevel,
    maxWinners: row.maxWinners,
    publishedAt: row.publishedAt,
    endedAt: row.endedAt,
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

// ─── Shared reads ────────────────────────────────────────────────────────────

/**
 * Every booking that counts for badges: the customer's stamp-earning chains
 * not taken back, each read on its completed row (slot start, type,
 * garage, categories with a package's members). Bounded.
 */
async function eligibleBookings(conn: Conn, userId: string, range?: { start: Date; end: Date }): Promise<Array<BadgeBooking & { vendorName: string; judgedAt: Date }>> {
  const rows = await (conn as typeof db).execute<{
    root_booking_id: string
    scheduled_at: Date | string
    completed_at: Date | string
    judged_at: Date | string
    vendor_id: string
    vendor_name: string
    booking_type: 'dropin' | 'doorstep' | 'pickup'
    categories: string[] | null
  }>(sql`
    select rb.root_booking_id, b.scheduled_at, rb.completed_at, rb.judged_at, rb.vendor_id, v.business_name as vendor_name,
           b.booking_type::text as booking_type, ${bookingCategories()} as categories
      from reward_bookings rb
      join bookings b on b.id = rb.booking_id
      join vendors v on v.id = rb.vendor_id
     where rb.user_id = ${userId}
       and rb.earned and rb.revoked_at is null
       ${range ? sql`and rb.completed_at >= ${range.start} and rb.completed_at < ${range.end}` : sql``}
     order by rb.completed_at
     limit 2000
  `)
  return Array.from(rows).map((row) => ({
    rootBookingId: row.root_booking_id,
    startAt: toDate(row.scheduled_at),
    completedAt: toDate(row.completed_at),
    judgedAt: toDate(row.judged_at),
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    bookingType: row.booking_type,
    categories: row.categories ?? [],
  }))
}

/** What the badge rules read: eligible bookings, reviews on them, rewarded invites. */
async function badgeFacts(conn: Conn, userId: string): Promise<BadgeFacts> {
  const bookings = await eligibleBookings(conn, userId)
  const [reviews] = await (conn as typeof db).execute<{ n: number }>(sql`
    select count(*)::int as n
      from reviews r
      join reward_bookings rb on rb.booking_id = r.booking_id and rb.earned and rb.revoked_at is null
     where r.user_id = ${userId}
  `)
  const [invites] = await (conn as typeof db).execute<{ n: number }>(sql`
    select count(*)::int as n from reward_referrals where referrer_id = ${userId} and status = 'rewarded'
  `)
  // 0057: Detlio Garage series collected in full (the Garage Legend badge).
  const [garage] = await (conn as typeof db).execute<{ n: number }>(sql`
    select count(*)::int as n from garage_series_completions where user_id = ${userId}
  `)
  return { bookings, reviews: Number(reviews?.n ?? 0), rewardedInvites: Number(invites?.n ?? 0), garageSeries: Number(garage?.n ?? 0) }
}

async function earnedBadgeKeys(conn: Conn, userId: string): Promise<Set<string>> {
  const rows = await (conn as typeof db)
    .select({ key: rewardBadgeAwards.badgeKey })
    .from(rewardBadgeAwards)
    .where(and(eq(rewardBadgeAwards.userId, userId), isNull(rewardBadgeAwards.challengeId)))
  return new Set(rows.map((row) => row.key))
}

/** Bonus stamps on the Shine Card, each lapsing like any stamp. */
async function addStamps(
  tx: AnyTx,
  input: { userId: string; count: number; now: Date; settings: RewardsSettings; badgeAwardId?: string; challengeId?: string }
) {
  if (input.count <= 0) return
  await tx.insert(rewardStamps).values(
    Array.from({ length: input.count }, () => ({
      userId: input.userId,
      source: input.badgeAwardId ? ('badge' as const) : ('challenge' as const),
      badgeAwardId: input.badgeAwardId ?? null,
      challengeId: input.badgeAwardId ? null : (input.challengeId ?? null),
      earnedAt: input.now,
      expiresAt: stampExpiresAt(input.now, input.settings),
    }))
  )
}

export interface AwardedBadge {
  id: string
  key: BadgeKey | 'challenge'
  challengeId: string | null
  bonusStamps: number
}

/** Awards every badge reached and switched on, with its bonus stamps. Inside the customer's lock. */
async function awardBadges(
  tx: AnyTx,
  input: {
    userId: string
    now: Date
    settings: RewardsSettings
    achievements: Record<BadgeKey, BadgeSettings>
    rootBookingId: string | null
    facts?: BadgeFacts
    /** 0057: the Detlio Garage cards each badge gave (`badgeBonusCards`), for the caller to tell. */
    garagePulls?: PullOutcome[]
  }
): Promise<AwardedBadge[]> {
  const facts = input.facts ?? (await badgeFacts(tx, input.userId))
  const due = badgesToAward(facts, await earnedBadgeKeys(tx, input.userId), input.achievements)
  const awarded: AwardedBadge[] = []
  for (const badge of due) {
    const [row] = await tx
      .insert(rewardBadgeAwards)
      .values({
        userId: input.userId,
        badgeKey: badge.key,
        rootBookingId: input.rootBookingId,
        bonusStamps: badge.bonusStamps,
        earnedAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ id: rewardBadgeAwards.id })
    if (!row) continue
    await addStamps(tx, { userId: input.userId, count: badge.bonusStamps, now: input.now, settings: input.settings, badgeAwardId: row.id })
    awarded.push({ id: row.id, key: badge.key, challengeId: null, bonusStamps: badge.bonusStamps })
    // 0057: a badge's bonus Garage cards (none for Garage Legend itself, nor while the Garage is not live).
    if (badge.key !== 'garage_legend' && input.garagePulls) {
      for (let i = 0; i < garageSettings(input.settings).badgeBonusCards; i += 1) {
        const pulled = await garageTx.pull(tx, { userId: input.userId, source: 'badge', badgeAwardId: row.id, rootBookingId: input.rootBookingId, now: input.now, settings: input.settings })
        if (!pulled) break
        input.garagePulls.push(pulled)
      }
    }
  }
  return awarded
}

export interface ChallengeWin {
  challenge: Challenge
  bonusStamps: number
  voucherId: string | null
  badgeAwardId: string | null
}

export type CountResult =
  | { kind: 'already' }
  | {
      kind: 'counted'
      userId: string
      badges: AwardedBadge[]
      wins: ChallengeWin[]
      oneLeft: Challenge[]
      full: Challenge[]
      vouchers: IssuedVoucher[]
      capAlert: { month: string; issuedPaise: number } | null
      /** 0057: Detlio Garage cards a challenge or a badge gave, for the service to tell. */
      garagePulls: PullOutcome[]
    }

/** The challenge rows a booking starting on `dayKey` could count toward: published, its dates around the day. */
async function challengesAround(conn: Conn, dayKey: string): Promise<Challenge[]> {
  const rows = await (conn as typeof db)
    .select()
    .from(rewardChallenges)
    .where(
      and(
        isNotNull(rewardChallenges.publishedAt),
        sql`${rewardChallenges.startDate} <= ${dayKey}::date`,
        sql`${rewardChallenges.endDate} >= ${dayKey}::date`
      )
    )
    .orderBy(asc(rewardChallenges.id))
  return rows.map(toChallenge)
}

/** A customer's counted bookings for a challenge, not taken back since. */
async function countedFor(conn: Conn, challengeId: string, userId: string) {
  return (conn as typeof db)
    .select({ rootBookingId: rewardChallengeBookings.rootBookingId, extraStamps: rewardChallengeBookings.extraStamps })
    .from(rewardChallengeBookings)
    .innerJoin(rewardBookings, eq(rewardBookings.rootBookingId, rewardChallengeBookings.rootBookingId))
    .where(
      and(
        eq(rewardChallengeBookings.challengeId, challengeId),
        eq(rewardChallengeBookings.userId, userId),
        isNull(rewardBookings.revokedAt)
      )
    )
}

/**
 * Gives a challenge's prize, once (the winner row is the claim). Inside
 * the customer's lock and the challenge's.
 */
async function grantWin(
  tx: AnyTx,
  input: { challenge: Challenge; userId: string; rootBookingId: string; now: Date; settings: RewardsSettings }
): Promise<{ win: ChallengeWin; vouchers: IssuedVoucher[]; garagePulls: PullOutcome[] } | null> {
  const { challenge: c, userId, now, settings } = input
  const [claimed] = await tx
    .insert(rewardChallengeWinners)
    .values({ challengeId: c.id, userId, wonAt: now, rootBookingId: input.rootBookingId })
    .onConflictDoNothing()
    .returning({ challengeId: rewardChallengeWinners.challengeId })
  if (!claimed) return null

  const vouchers: IssuedVoucher[] = []
  const garagePulls: PullOutcome[] = []
  let bonusStamps = 0
  let voucherId: string | null = null
  let badgeAwardId: string | null = null
  switch (c.rewardKind) {
    case 'garage_cards': {
      // 0057: each a random pull, like a booking's.
      for (let i = 0; i < (c.rewardCards ?? 0); i += 1) {
        const pulled = await garageTx.pull(tx, { userId, source: 'challenge', challengeId: c.id, rootBookingId: input.rootBookingId, now, settings })
        if (!pulled) break
        garagePulls.push(pulled)
      }
      break
    }
    case 'stamps':
      bonusStamps = c.rewardStamps ?? 0
      await addStamps(tx, { userId, count: bonusStamps, now, settings, challengeId: c.id })
      break
    case 'voucher': {
      const voucher = await rewardsTx.issueVoucher(tx, {
        userId,
        kind: 'challenge',
        amount: c.rewardAmount ?? 0,
        now,
        settings,
        sourceBookingId: input.rootBookingId,
      })
      voucherId = voucher.id
      vouchers.push({ id: voucher.id, kind: voucher.kind, amount: voucher.amount, userId })
      break
    }
    case 'multiplier': {
      // Double stamps on every booking counted so far, this one included.
      const extra = multiplierExtra(c.rewardMultiplier)
      for (const row of await countedFor(tx, c.id, userId)) {
        const add = Math.max(0, extra - row.extraStamps)
        if (add === 0) continue
        await addStamps(tx, { userId, count: add, now, settings, challengeId: c.id })
        await tx
          .update(rewardChallengeBookings)
          .set({ extraStamps: extra })
          .where(and(eq(rewardChallengeBookings.challengeId, c.id), eq(rewardChallengeBookings.rootBookingId, row.rootBookingId)))
        bonusStamps += add
      }
      break
    }
    case 'badge': {
      const [award] = await tx
        .insert(rewardBadgeAwards)
        .values({ userId, badgeKey: CHALLENGE_BADGE_KEY, challengeId: c.id, rootBookingId: input.rootBookingId, earnedAt: now })
        .onConflictDoNothing()
        .returning({ id: rewardBadgeAwards.id })
      badgeAwardId = award?.id ?? null
      break
    }
  }
  await tx
    .update(rewardChallengeWinners)
    .set({ voucherId, bonusStamps, badgeAwardId })
    .where(and(eq(rewardChallengeWinners.challengeId, c.id), eq(rewardChallengeWinners.userId, userId)))
  return { win: { challenge: c, bonusStamps, voucherId, badgeAwardId }, vouchers, garagePulls }
}

// ─── The repository ──────────────────────────────────────────────────────────

export const rewardExtrasRepository = {
  /**
   * A chain that earned its stamp, counted for challenges and badges once
   * (`reward_bookings.extras_at`, claimed in this transaction), under the
   * customer's lock: each live challenge it fits (window, type, category,
   * audience) counts it, and may be won; then every badge now reached.
   * Stamps added may fill the Shine Card (a voucher, 0050's rules), and
   * vouchers count toward the month's budget.
   */
  async countStamp(input: {
    userId: string
    rootBookingId: string
    now: Date
    settings: RewardsSettings
    achievements: Record<BadgeKey, BadgeSettings>
  }): Promise<CountResult> {
    const { userId, rootBookingId, now, settings } = input
    return db.transaction(async (tx): Promise<CountResult> => {
      await rewardsTx.lockRewards(tx, userId)
      const [claimed] = await tx
        .update(rewardBookings)
        .set({ extrasAt: now })
        .where(
          and(
            eq(rewardBookings.rootBookingId, rootBookingId),
            eq(rewardBookings.userId, userId),
            eq(rewardBookings.earned, true),
            isNull(rewardBookings.revokedAt),
            isNull(rewardBookings.extrasAt)
          )
        )
        .returning({ judgedAt: rewardBookings.judgedAt })
      if (!claimed) return { kind: 'already' }

      const facts = await badgeFacts(tx, userId)
      const booking = facts.bookings.find((row) => row.rootBookingId === rootBookingId)
      const wins: ChallengeWin[] = []
      const garagePulls: PullOutcome[] = []
      const oneLeft: Challenge[] = []
      const full: Challenge[] = []
      const vouchers: IssuedVoucher[] = []
      let stampsAdded = false

      if (booking) {
        const level: RewardLevel = await rewardsTx.levelOf(tx, userId, now, settings)
        for (const c of await challengesAround(tx, istDateKey(booking.startAt))) {
          if (!bookingCounts(c, booking) || !inAudience(c, level)) continue
          // Counted from when it was published: a completion judged before that is not.
          if (c.publishedAt && claimed.judgedAt < c.publishedAt) continue
          const [counted] = await tx
            .insert(rewardChallengeBookings)
            .values({ challengeId: c.id, rootBookingId, userId, countedAt: now })
            .onConflictDoNothing()
            .returning({ rootBookingId: rewardChallengeBookings.rootBookingId })
          if (!counted) continue

          const [already] = await tx
            .select({ userId: rewardChallengeWinners.userId })
            .from(rewardChallengeWinners)
            .where(and(eq(rewardChallengeWinners.challengeId, c.id), eq(rewardChallengeWinners.userId, userId)))
            .limit(1)
          if (already) {
            // Won already: "double stamps" goes on for each booking in the window.
            const extra = c.rewardKind === 'multiplier' ? multiplierExtra(c.rewardMultiplier) : 0
            if (extra > 0) {
              await addStamps(tx, { userId, count: extra, now, settings, challengeId: c.id })
              await tx
                .update(rewardChallengeBookings)
                .set({ extraStamps: extra })
                .where(and(eq(rewardChallengeBookings.challengeId, c.id), eq(rewardChallengeBookings.rootBookingId, rootBookingId)))
              stampsAdded = true
            }
            continue
          }

          const count = (await countedFor(tx, c.id, userId)).length
          if (count < c.goalCount) {
            if (oneLeftDue(count, c.goalCount)) oneLeft.push(c)
            continue
          }
          await lockChallenge(tx, c.id)
          const [fresh] = await tx.select().from(rewardChallenges).where(eq(rewardChallenges.id, c.id)).limit(1)
          const current = fresh ? toChallenge(fresh) : c
          // Ended early meanwhile: a booking whose slot started after the end no longer fits.
          if (!bookingCounts(current, booking)) continue
          const [winners] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(rewardChallengeWinners)
            .where(eq(rewardChallengeWinners.challengeId, c.id))
          const outcome = challengeOutcome({
            count,
            goal: current.goalCount,
            alreadyWon: false,
            winners: Number(winners?.n ?? 0),
            maxWinners: current.maxWinners,
          })
          if (outcome === 'full') {
            full.push(current)
            continue
          }
          if (outcome !== 'won') continue
          const granted = await grantWin(tx, { challenge: current, userId, rootBookingId, now, settings })
          if (!granted) continue
          wins.push(granted.win)
          vouchers.push(...granted.vouchers)
          garagePulls.push(...granted.garagePulls)
          if (granted.win.bonusStamps > 0) stampsAdded = true
        }
      }

      const badges = await awardBadges(tx, { userId, now, settings, achievements: input.achievements, rootBookingId, facts, garagePulls })
      for (const win of wins) {
        if (win.badgeAwardId) badges.push({ id: win.badgeAwardId, key: 'challenge', challengeId: win.challenge.id, bonusStamps: 0 })
      }
      if (badges.some((badge) => badge.bonusStamps > 0)) stampsAdded = true
      // 0057: the Garage cards' duplicates and rows may add stamps and vouchers too.
      for (const pulled of garagePulls) {
        vouchers.push(...pulled.vouchers)
        if (pulled.stampsAdded) stampsAdded = true
      }
      const garageCapHit = garagePulls.some((p) => p.capHit)
      if (stampsAdded) vouchers.push(...(await rewardsTx.convertFullCards(tx, { userId, now, settings, sourceBookingId: rootBookingId })))
      const capAlert = vouchers.length > 0 || garageCapHit ? await rewardsTx.capCheck(tx, { now, settings, forced: garageCapHit }) : null
      return { kind: 'counted', userId, badges, wins, oneLeft, full, vouchers, capAlert, garagePulls }
    })
  },

  /** Earned chains of the last `since` not yet counted for badges and challenges (the cron's catch-up). */
  async listUncounted(since: Date, limit: number) {
    return db
      .select({ rootBookingId: rewardBookings.rootBookingId, userId: rewardBookings.userId })
      .from(rewardBookings)
      .where(
        and(
          eq(rewardBookings.earned, true),
          isNull(rewardBookings.revokedAt),
          isNull(rewardBookings.extrasAt),
          gte(rewardBookings.judgedAt, since)
        )
      )
      .orderBy(asc(rewardBookings.judgedAt))
      .limit(limit)
  },

  /**
   * The nightly badge pass: customers in the programme not checked since
   * today's pass began, or with a review or a rewarded invite since their
   * last check. Never checked first.
   */
  async listBadgeCheckCandidates(dayStart: Date, limit: number): Promise<string[]> {
    const rows = await db.execute<{ user_id: string }>(sql`
      with people as (
        select distinct rb.user_id from reward_bookings rb where rb.earned and rb.revoked_at is null
        union
        select distinct r.referrer_id from reward_referrals r where r.status = 'rewarded'
      )
      select p.user_id
        from people p
        left join reward_badge_checks c on c.user_id = p.user_id
       where c.checked_at is null
          or c.checked_at < ${dayStart}
          or exists (select 1 from reviews r where r.user_id = p.user_id and r.created_at > c.checked_at)
          or exists (select 1 from reward_referrals rr where rr.referrer_id = p.user_id and rr.settled_at > c.checked_at)
       order by c.checked_at nulls first, p.user_id
       limit ${limit}
    `)
    return Array.from(rows).map((row) => row.user_id)
  },

  /** One customer's badges checked (the nightly pass): any now reached are awarded, and the check recorded. */
  async checkBadges(input: {
    userId: string
    now: Date
    settings: RewardsSettings
    achievements: Record<BadgeKey, BadgeSettings>
  }): Promise<{ badges: AwardedBadge[]; vouchers: IssuedVoucher[]; capAlert: { month: string; issuedPaise: number } | null; garagePulls: PullOutcome[] }> {
    const { userId, now, settings } = input
    return db.transaction(async (tx) => {
      await rewardsTx.lockRewards(tx, userId)
      const garagePulls: PullOutcome[] = []
      const badges = await awardBadges(tx, { userId, now, settings, achievements: input.achievements, rootBookingId: null, garagePulls })
      const vouchers = garagePulls.flatMap((p) => p.vouchers)
      if (badges.some((badge) => badge.bonusStamps > 0) || garagePulls.some((p) => p.stampsAdded)) {
        vouchers.push(...(await rewardsTx.convertFullCards(tx, { userId, now, settings })))
      }
      const garageCapHit = garagePulls.some((p) => p.capHit)
      const capAlert = vouchers.length > 0 || garageCapHit ? await rewardsTx.capCheck(tx, { now, settings, forced: garageCapHit }) : null
      await tx
        .insert(rewardBadgeChecks)
        .values({ userId, checkedAt: now })
        .onConflictDoUpdate({ target: rewardBadgeChecks.userId, set: { checkedAt: now } })
      return { badges, vouchers, capAlert, garagePulls }
    })
  },

  /** Badges of the last `since` with no celebration sent yet (claimed as a 'badge' nudge). */
  async listUncelebratedBadges(since: Date, limit: number) {
    const rows = await db.execute<{
      id: string
      user_id: string
      badge_key: BadgeKey | 'challenge'
      challenge_id: string | null
      bonus_stamps: number
      challenge_title: string | null
    }>(sql`
      select a.id, a.user_id, a.badge_key, a.challenge_id, a.bonus_stamps, c.title as challenge_title
        from reward_badge_awards a
        left join reward_challenges c on c.id = a.challenge_id
       where a.earned_at >= ${since}
         and not exists (
           select 1 from reward_nudges n where n.user_id = a.user_id and n.kind = 'badge' and n.subject_key = 'badge:' || a.id
         )
       order by a.earned_at
       limit ${limit}
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      userId: row.user_id,
      key: row.badge_key,
      challengeId: row.challenge_id,
      bonusStamps: Number(row.bonus_stamps),
      challengeTitle: row.challenge_title,
    }))
  },

  /** Wins of the last `since` with no "You won" sent yet. */
  async listUncelebratedWins(since: Date, limit: number) {
    const rows = await db
      .select({ challenge: rewardChallenges, userId: rewardChallengeWinners.userId })
      .from(rewardChallengeWinners)
      .innerJoin(rewardChallenges, eq(rewardChallenges.id, rewardChallengeWinners.challengeId))
      .where(
        and(
          gte(rewardChallengeWinners.wonAt, since),
          sql`not exists (select 1 from reward_nudges n where n.user_id = ${rewardChallengeWinners.userId} and n.kind = 'challenge_won' and n.subject_key = 'challenge_won:' || ${rewardChallengeWinners.challengeId})`
        )
      )
      .orderBy(asc(rewardChallengeWinners.wonAt))
      .limit(limit)
    return rows.map((row) => ({ userId: row.userId, challenge: toChallenge(row.challenge) }))
  },

  /** Published challenges whose window includes `dayKey`, or that start or end near it. */
  async listPublishedAround(fromKey: string, toKey: string): Promise<Challenge[]> {
    const rows = await db
      .select()
      .from(rewardChallenges)
      .where(
        and(
          isNotNull(rewardChallenges.publishedAt),
          sql`${rewardChallenges.endDate} >= ${fromKey}::date`,
          sql`${rewardChallenges.startDate} <= ${toKey}::date`
        )
      )
      .orderBy(asc(rewardChallenges.endDate), asc(rewardChallenges.id))
      .limit(50)
    return rows.map(toChallenge)
  },

  /**
   * Customers to tell a challenge has started: a device with Reminders on,
   * not told about it yet, and not nudged within the gap (it is a reminder
   * to book, so it waits for the gap). The audience's level is the
   * service's to check. Bounded.
   */
  async listStartCandidates(challengeId: string, quietSince: Date, limit: number): Promise<string[]> {
    const rows = await db.execute<{ user_id: string }>(sql`
      select distinct ps.user_id
        from push_subscriptions ps
        join users u on u.id = ps.user_id and u.push_reminders
       where ps.audience = 'customer'
         and not exists (
           select 1 from reward_nudges n
            where n.user_id = ps.user_id and n.kind = 'challenge_start' and n.subject_key = ${`challenge_start:${challengeId}`}
         )
         and not exists (
           select 1 from reward_nudges n
            where n.user_id = ps.user_id and n.sent_at > ${quietSince}
              and n.kind not in (${sql.join(CELEBRATORY_NUDGE_KINDS.map((kind) => sql`${kind}`), sql`, `)})
         )
       limit ${limit}
    `)
    return Array.from(rows).map((row) => row.user_id)
  },

  /** Customers one booking from a live challenge, not told yet (the cron's catch-up of "one more"). */
  async listOneLeftCandidates(challenge: Challenge, limit: number): Promise<string[]> {
    if (challenge.goalCount < 2) return []
    const rows = await db.execute<{ user_id: string }>(sql`
      select cb.user_id
        from reward_challenge_bookings cb
        join reward_bookings rb on rb.root_booking_id = cb.root_booking_id and rb.revoked_at is null
       where cb.challenge_id = ${challenge.id}
         and not exists (select 1 from reward_challenge_winners w where w.challenge_id = cb.challenge_id and w.user_id = cb.user_id)
         and not exists (
           select 1 from reward_nudges n
            where n.user_id = cb.user_id and n.kind = 'challenge_one_left' and n.subject_key = ${`challenge_one_left:${challenge.id}`}
         )
       group by cb.user_id
      having count(*) = ${challenge.goalCount - 1}
       limit ${limit}
    `)
    return Array.from(rows).map((row) => row.user_id)
  },

  /** Customers with a Wrapped for the year who were not told it is here. Bounded. */
  async listWrappedPushCandidates(year: number, limit: number): Promise<string[]> {
    const { start, end } = yearRange(year)
    const rows = await db.execute<{ user_id: string }>(sql`
      select distinct rb.user_id
        from reward_bookings rb
       where rb.earned and rb.revoked_at is null
         and rb.completed_at >= ${start} and rb.completed_at < ${end}
         and not exists (
           select 1 from reward_nudges n where n.user_id = rb.user_id and n.kind = 'wrapped' and n.subject_key = ${`wrapped:${year}`}
         )
       limit ${limit}
    `)
    return Array.from(rows).map((row) => row.user_id)
  },

  // ─── The customer ─────────────────────────────────────────────────────────

  /** Every badge the customer earned (a challenge's with its title), newest first. */
  async listAwards(userId: string) {
    return db
      .select({
        id: rewardBadgeAwards.id,
        key: rewardBadgeAwards.badgeKey,
        challengeId: rewardBadgeAwards.challengeId,
        challengeTitle: rewardChallenges.title,
        bonusStamps: rewardBadgeAwards.bonusStamps,
        earnedAt: rewardBadgeAwards.earnedAt,
        seenAt: rewardBadgeAwards.seenAt,
        rootBookingId: rewardBadgeAwards.rootBookingId,
      })
      .from(rewardBadgeAwards)
      .leftJoin(rewardChallenges, eq(rewardChallenges.id, rewardBadgeAwards.challengeId))
      .where(eq(rewardBadgeAwards.userId, userId))
      .orderBy(desc(rewardBadgeAwards.earnedAt))
      .limit(200)
  },

  badgeFacts(userId: string) {
    return badgeFacts(db, userId)
  },

  /** The celebration was shown: only the session's own badges. */
  async markSeen(userId: string, ids: string[], now: Date): Promise<number> {
    if (ids.length === 0) return 0
    const rows = await db
      .update(rewardBadgeAwards)
      .set({ seenAt: now })
      .where(and(eq(rewardBadgeAwards.userId, userId), inArray(rewardBadgeAwards.id, ids), isNull(rewardBadgeAwards.seenAt)))
      .returning({ id: rewardBadgeAwards.id })
    return rows.length
  },

  /** The customer's standing in each challenge: counted bookings, whether won, and the winners so far. */
  async standings(userId: string, challengeIds: string[]) {
    if (challengeIds.length === 0) return new Map<string, { count: number; wonAt: Date | null; winners: number }>()
    const counts = await db
      .select({ challengeId: rewardChallengeBookings.challengeId, n: sql<number>`count(*)::int` })
      .from(rewardChallengeBookings)
      .innerJoin(rewardBookings, eq(rewardBookings.rootBookingId, rewardChallengeBookings.rootBookingId))
      .where(
        and(
          eq(rewardChallengeBookings.userId, userId),
          inArray(rewardChallengeBookings.challengeId, challengeIds),
          isNull(rewardBookings.revokedAt)
        )
      )
      .groupBy(rewardChallengeBookings.challengeId)
    const won = await db
      .select({ challengeId: rewardChallengeWinners.challengeId, wonAt: rewardChallengeWinners.wonAt })
      .from(rewardChallengeWinners)
      .where(and(eq(rewardChallengeWinners.userId, userId), inArray(rewardChallengeWinners.challengeId, challengeIds)))
    const winners = await db
      .select({ challengeId: rewardChallengeWinners.challengeId, n: sql<number>`count(*)::int` })
      .from(rewardChallengeWinners)
      .where(inArray(rewardChallengeWinners.challengeId, challengeIds))
      .groupBy(rewardChallengeWinners.challengeId)
    const map = new Map<string, { count: number; wonAt: Date | null; winners: number }>()
    for (const id of challengeIds) {
      map.set(id, {
        count: Number(counts.find((row) => row.challengeId === id)?.n ?? 0),
        wonAt: won.find((row) => row.challengeId === id)?.wonAt ?? null,
        winners: Number(winners.find((row) => row.challengeId === id)?.n ?? 0),
      })
    }
    return map
  },

  /** Eligible bookings per IST year, for the years asked (one grouped read). */
  async washesInYears(userId: string, years: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>()
    if (years.length === 0) return map
    const from = yearRange(Math.min(...years)).start
    const to = yearRange(Math.max(...years)).end
    const rows = await db.execute<{ year: number; n: number }>(sql`
      select extract(year from rb.completed_at at time zone 'Asia/Kolkata')::int as year, count(*)::int as n
        from reward_bookings rb
       where rb.user_id = ${userId} and rb.earned and rb.revoked_at is null
         and rb.completed_at >= ${from} and rb.completed_at < ${to}
       group by 1
    `)
    for (const row of Array.from(rows)) map.set(Number(row.year), Number(row.n))
    return map
  },

  async findFirstName(userId: string): Promise<string | null> {
    const [row] = await db.execute<{ name: string }>(sql`select name from users where id = ${userId} limit 1`)
    return row?.name ?? null
  },

  // ─── Wrapped ──────────────────────────────────────────────────────────────

  async findWrapped(userId: string, year: number) {
    const [row] = await db
      .select()
      .from(rewardWrapped)
      .where(and(eq(rewardWrapped.userId, userId), eq(rewardWrapped.year, year)))
      .limit(1)
    return row
  },

  async saveWrapped(userId: string, year: number, stats: WrappedStats, now: Date) {
    await db
      .insert(rewardWrapped)
      .values({ userId, year, stats, computedAt: now })
      .onConflictDoUpdate({ target: [rewardWrapped.userId, rewardWrapped.year], set: { stats, computedAt: now } })
  },

  /**
   * What a customer-year's Wrapped is made of, in a few bounded reads:
   * their eligible bookings that year (with garage names), what reward
   * vouchers saved on bookings that kept them, the badges earned that
   * year, and what their level is worked out from at `levelAt`.
   */
  async wrappedFacts(userId: string, year: number, levelAt: Date, settings: RewardsSettings) {
    const range = yearRange(year)
    const bookings: WrappedBooking[] = (await eligibleBookings(db, userId, range)).map((row) => ({
      completedAt: row.completedAt,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
    }))
    const [saved] = await db.execute<{ total: string | null }>(sql`
      select sum(dr.discount_amount) as total
        from discount_redemptions dr
        join discounts d on d.id = dr.discount_id and d.source = 'reward'
        join bookings on bookings.id = dr.booking_id
        join payments on payments.booking_id = bookings.id
       where dr.user_id = ${userId} and ${DISCOUNT_HELD}
         and dr.created_at >= ${range.start} and dr.created_at < ${range.end}
    `)
    const badges = await db
      .select({ key: rewardBadgeAwards.badgeKey, challengeTitle: rewardChallenges.title })
      .from(rewardBadgeAwards)
      .leftJoin(rewardChallenges, eq(rewardChallenges.id, rewardBadgeAwards.challengeId))
      .where(and(eq(rewardBadgeAwards.userId, userId), gte(rewardBadgeAwards.earnedAt, range.start), lt(rewardBadgeAwards.earnedAt, range.end)))
      .orderBy(asc(rewardBadgeAwards.earnedAt))
    // The level at that moment: 0050's rule, bounded at both ends.
    const [level] = await db.execute<{ bookings: number; drops: number }>(sql`
      select
        (select count(*)::int from reward_bookings rb
          where rb.user_id = ${userId} and rb.earned and rb.revoked_at is null
            and rb.completed_at > ${monthsBefore(levelAt, settings.levelWindowMonths)} and rb.completed_at <= ${levelAt}) as bookings,
        (select count(*)::int from reward_level_drops d
          where d.user_id = ${userId}
            and d.dropped_at > ${monthsBefore(levelAt, settings.noShowDropMonths)} and d.dropped_at <= ${levelAt}) as drops
    `)
    return {
      bookings,
      savedPaise: paise(saved?.total ?? null),
      badges: badges.map((row) => ({ key: row.key, challengeTitle: row.challengeTitle })),
      level: levelFor(Number(level?.bookings ?? 0), Number(level?.drops ?? 0), settings),
    }
  },

  /** The customer opened or shared their Wrapped: counts only. */
  async recordWrappedEvent(userId: string, year: number, kind: 'opened' | 'shared', now: Date): Promise<boolean> {
    const rows =
      kind === 'opened'
        ? await db
            .update(rewardWrapped)
            .set({ openedCount: sql`${rewardWrapped.openedCount} + 1`, firstOpenedAt: sql`coalesce(${rewardWrapped.firstOpenedAt}, ${now})` })
            .where(and(eq(rewardWrapped.userId, userId), eq(rewardWrapped.year, year)))
            .returning({ year: rewardWrapped.year })
        : await db
            .update(rewardWrapped)
            .set({ sharedCount: sql`${rewardWrapped.sharedCount} + 1` })
            .where(and(eq(rewardWrapped.userId, userId), eq(rewardWrapped.year, year)))
            .returning({ year: rewardWrapped.year })
    return rows.length > 0
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** How many customers earned each badge, ever and since `monthStart`. */
  async badgeCounts(monthStart: Date) {
    const rows = await db
      .select({
        key: rewardBadgeAwards.badgeKey,
        total: sql<number>`count(*)::int`,
        thisMonth: sql<number>`count(*) filter (where ${rewardBadgeAwards.earnedAt} >= ${monthStart})::int`,
        stamps: sql<number>`coalesce(sum(${rewardBadgeAwards.bonusStamps}), 0)::int`,
      })
      .from(rewardBadgeAwards)
      .where(isNull(rewardBadgeAwards.challengeId))
      .groupBy(rewardBadgeAwards.badgeKey)
    return rows.map((row) => ({ key: row.key, total: Number(row.total), thisMonth: Number(row.thisMonth), stamps: Number(row.stamps) }))
  },

  async listChallenges() {
    const rows = await db.select().from(rewardChallenges).orderBy(desc(rewardChallenges.startDate), desc(rewardChallenges.createdAt)).limit(200)
    return rows
  },

  async findChallenge(id: string) {
    const [row] = await db.select().from(rewardChallenges).where(eq(rewardChallenges.id, id)).limit(1)
    return row
  },

  /** Each challenge's participants, winners and cost: vouchers issued (₹) and stamps given. */
  async challengeFigures(ids: string[]) {
    if (ids.length === 0) return new Map<string, { participants: number; winners: number; voucherCost: string; stamps: number }>()
    const rows = await db.execute<{ id: string; participants: number; winners: number; voucher_cost: string | null; stamps: number }>(sql`
      select c.id,
             (select count(distinct cb.user_id)::int from reward_challenge_bookings cb where cb.challenge_id = c.id) as participants,
             (select count(*)::int from reward_challenge_winners w where w.challenge_id = c.id) as winners,
             (select sum(v.amount) from reward_challenge_winners w join reward_vouchers v on v.id = w.voucher_id where w.challenge_id = c.id) as voucher_cost,
             (select count(*)::int from reward_stamps s where s.challenge_id = c.id) as stamps
        from reward_challenges c
       where c.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
    `)
    const map = new Map<string, { participants: number; winners: number; voucherCost: string; stamps: number }>()
    for (const row of Array.from(rows)) {
      map.set(row.id, {
        participants: Number(row.participants),
        winners: Number(row.winners),
        voucherCost: rupees(paise(row.voucher_cost)),
        stamps: Number(row.stamps),
      })
    }
    return map
  },

  /** Everyone who took part, their count and whether (and when) they won; for the detail and the CSV. Bounded. */
  async challengeResults(challengeId: string, limit: number) {
    const rows = await db.execute<{
      user_id: string
      name: string
      phone: string
      counted: number
      first_counted_at: Date | string
      won_at: Date | string | null
      bonus_stamps: number | null
      voucher_amount: string | null
      voucher_code: string | null
      voucher_used: boolean | null
    }>(sql`
      select cb.user_id, u.name, u.phone,
             count(*) filter (where rb.revoked_at is null)::int as counted,
             min(cb.counted_at) as first_counted_at,
             w.won_at, w.bonus_stamps, v.amount as voucher_amount, d.code as voucher_code,
             case when w.voucher_id is null then null
                  else exists (
                    select 1 from discount_redemptions dr
                      join bookings on bookings.id = dr.booking_id
                      join payments on payments.booking_id = bookings.id
                     where dr.discount_id = v.discount_id and ${DISCOUNT_HELD}
                  ) end as voucher_used
        from reward_challenge_bookings cb
        join users u on u.id = cb.user_id
        join reward_bookings rb on rb.root_booking_id = cb.root_booking_id
        left join reward_challenge_winners w on w.challenge_id = cb.challenge_id and w.user_id = cb.user_id
        left join reward_vouchers v on v.id = w.voucher_id
        left join discounts d on d.id = v.discount_id
       where cb.challenge_id = ${challengeId}
       group by cb.user_id, u.name, u.phone, w.won_at, w.bonus_stamps, w.voucher_id, v.amount, v.discount_id, d.code
       order by w.won_at nulls last, counted desc, cb.user_id
       limit ${limit}
    `)
    return Array.from(rows).map((row) => ({
      userId: row.user_id,
      name: row.name,
      phone: row.phone,
      counted: Number(row.counted),
      firstCountedAt: toDate(row.first_counted_at),
      wonAt: row.won_at ? toDate(row.won_at) : null,
      bonusStamps: row.bonus_stamps === null ? null : Number(row.bonus_stamps),
      voucherAmount: row.voucher_amount === null ? null : Number(row.voucher_amount).toFixed(2),
      voucherCode: row.voucher_code,
      voucherUsed: row.voucher_used,
    }))
  },

  /**
   * Creates a challenge as a draft, with its audit row in the same
   * transaction.
   */
  async createChallenge(input: ChallengeInput & { actorName: string; actorSub: string; now: Date }) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(rewardChallenges)
        .values({ ...challengeValues(input), createdBy: input.actorName, createdAt: input.now, updatedAt: input.now })
        .returning()
      await tx.insert(adminAuditLog).values({
        action: 'reward_challenge_created',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { challengeId: row.id, title: row.title },
        detail: { challenge: challengeValues(input) },
      })
      return row
    })
  },

  /**
   * Edits a challenge under its lock: `decide` sees the row as it is now and
   * says what may change (null) or why not; the audit row names before and
   * after.
   */
  async updateChallenge(input: {
    id: string
    next: ChallengeInput
    actorName: string
    actorSub: string
    now: Date
    decide: (current: ChallengeRow) => string | null
  }): Promise<{ kind: 'not_found' } | { kind: 'refused'; reason: string } | { kind: 'ok'; row: ChallengeRow }> {
    return db.transaction(async (tx) => {
      await lockChallenge(tx, input.id)
      const [current] = await tx.select().from(rewardChallenges).where(eq(rewardChallenges.id, input.id)).limit(1)
      if (!current) return { kind: 'not_found' as const }
      const reason = input.decide(current)
      if (reason) return { kind: 'refused' as const, reason }
      const [row] = await tx
        .update(rewardChallenges)
        .set({ ...challengeValues(input.next), updatedAt: input.now })
        .where(eq(rewardChallenges.id, input.id))
        .returning()
      await tx.insert(adminAuditLog).values({
        action: 'reward_challenge_updated',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { challengeId: input.id, title: row.title },
        detail: { before: challengeValues(toChallenge(current)), after: challengeValues(input.next) },
      })
      return { kind: 'ok' as const, row }
    })
  },

  /** Publishes (schedules) or ends a challenge under its lock, once, with the audit row. */
  async setChallengeState(input: {
    id: string
    action: 'publish' | 'end'
    actorName: string
    actorSub: string
    now: Date
    decide: (current: ChallengeRow) => string | null
  }): Promise<{ kind: 'not_found' } | { kind: 'refused'; reason: string } | { kind: 'ok'; row: ChallengeRow }> {
    return db.transaction(async (tx) => {
      await lockChallenge(tx, input.id)
      const [current] = await tx.select().from(rewardChallenges).where(eq(rewardChallenges.id, input.id)).limit(1)
      if (!current) return { kind: 'not_found' as const }
      const reason = input.decide(current)
      if (reason) return { kind: 'refused' as const, reason }
      const set =
        input.action === 'publish'
          ? { publishedAt: input.now, publishedBy: input.actorName, updatedAt: input.now }
          : { endedAt: input.now, endedBy: input.actorName, updatedAt: input.now }
      const [row] = await tx.update(rewardChallenges).set(set).where(eq(rewardChallenges.id, input.id)).returning()
      await tx.insert(adminAuditLog).values({
        action: input.action === 'publish' ? 'reward_challenge_published' : 'reward_challenge_ended',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { challengeId: input.id, title: row.title },
        detail: { startDate: row.startDate, endDate: row.endDate },
      })
      return { kind: 'ok' as const, row }
    })
  },

  /** Wrapped for a year: how many were made, opened and shared (counts only). */
  async wrappedStats(year: number) {
    const [row] = await db
      .select({
        made: sql<number>`count(*)::int`,
        opened: sql<number>`count(*) filter (where ${rewardWrapped.openedCount} > 0)::int`,
        opens: sql<number>`coalesce(sum(${rewardWrapped.openedCount}), 0)::int`,
        sharers: sql<number>`count(*) filter (where ${rewardWrapped.sharedCount} > 0)::int`,
        shares: sql<number>`coalesce(sum(${rewardWrapped.sharedCount}), 0)::int`,
      })
      .from(rewardWrapped)
      .where(eq(rewardWrapped.year, year))
    const { start, end } = yearRange(year)
    const [eligible] = await db.execute<{ n: number }>(sql`
      select count(distinct user_id)::int as n from reward_bookings
       where earned and revoked_at is null and completed_at >= ${start} and completed_at < ${end}
    `)
    const [told] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from reward_nudges where kind = 'wrapped' and subject_key = ${`wrapped:${year}`}
    `)
    return {
      customersWithWashes: Number(eligible?.n ?? 0),
      notified: Number(told?.n ?? 0),
      made: Number(row?.made ?? 0),
      opened: Number(row?.opened ?? 0),
      opens: Number(row?.opens ?? 0),
      sharers: Number(row?.sharers ?? 0),
      shares: Number(row?.shares ?? 0),
    }
  },
}

/** A challenge's columns from the form's values. */
function challengeValues(input: ChallengeInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    startDate: input.startDate,
    endDate: input.endDate,
    goalCount: input.goalCount,
    category: input.category,
    bookingType: input.bookingType,
    rewardKind: input.rewardKind,
    rewardStamps: input.rewardKind === 'stamps' ? input.rewardStamps : null,
    rewardAmount: input.rewardKind === 'voucher' && input.rewardAmount !== null ? rupees(input.rewardAmount * 100) : null,
    rewardMultiplier: input.rewardKind === 'multiplier' ? input.rewardMultiplier : null,
    rewardCards: input.rewardKind === 'garage_cards' ? input.rewardCards : null,
    audienceMinLevel: input.audienceMinLevel,
    maxWinners: input.maxWinners,
  }
}

