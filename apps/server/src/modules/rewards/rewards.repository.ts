import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  adminAuditLog,
  bookings,
  discounts,
  payments,
  rewardBookings,
  rewardCapMonths,
  rewardInviteOpens,
  rewardLevelDrops,
  rewardNudges,
  rewardPerks,
  rewardReferralCodes,
  rewardReferrals,
  rewardScratchCards,
  rewardSettings,
  rewardStamps,
  rewardVouchers,
  userVehicles,
  users,
  vendors,
} from '../../db/schema.js'
import { istDateKey, istParts } from '../../lib/ist.js'
import {
  CELEBRATORY_NUDGE_KINDS,
  capReached,
  discountPercent,
  eligibleAmountPaise,
  fullCards,
  isCelebratoryNudge,
  istMonthKey,
  istMonthRange,
  istYearStart,
  levelFor,
  levelSettings,
  monthsBefore,
  newVoucherCode,
  paise,
  prizeWithinCap,
  referralOutcome,
  REWARDS_FIXED,
  rupees,
  scratchCardExpiresAt,
  scratchVoucherKind,
  settingsChanges,
  stampAdjustmentRefusal,
  stampExpiresAt,
  stampRefusal,
  stampRevocation,
  stampsOnCard,
  streakBonusDue,
  VOUCHER_LABELS,
  voucherExpiresAt,
  type NudgeKind,
  type PerkKind,
  type RewardLevel,
  type RewardsSettings,
  type ScratchOutcome,
  type StampRefusal,
  type StampRow,
  type VoucherKind,
} from '../../lib/rewards.js'
import { DISCOUNT_HELD } from '../discounts/discounts.predicates.js'
import { WASH_CATEGORIES } from '../home/home.repository.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = PgTransaction<any, any, any>
type Conn = typeof db | AnyTx

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Locks ───────────────────────────────────────────────────────────────────
//
// Every write to a customer's rewards takes `rewards:<userId>` first, so two
// completions (or a completion and a scratch, a no-show, a perk or an
// adjustment) never both turn the same stamps into a voucher, or both earn
// the same day's stamp. Taken on its own, never alongside the booking-write
// locks: rewards are written after the booking's own transaction commits.
// Order within it: rewards:<user> → rewards-referrer:<inviter> (only when
// settling an invite) → rewards:cap (only when drawing a scratch card's
// prize, so the month's cap is never overshot by two cards at once).
// `reward-settings` (an admin save) is taken on its own.

async function lockRewards(tx: AnyTx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rewards:${userId}`})::bigint)`)
}

async function lockReferrer(tx: AnyTx, referrerId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rewards-referrer:${referrerId}`})::bigint)`)
}

async function lockCap(tx: AnyTx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('rewards:cap')::bigint)`)
}

/**
 * A nudge that holds the gap: every kind but the celebrations (0054). Over
 * a column of `reward_nudges.kind`.
 */
function countsTowardGap(kindColumn: SQL | AnyColumnLike): SQL {
  return sql`${kindColumn} not in (${sql.join(CELEBRATORY_NUDGE_KINDS.map((kind) => sql`${kind}`), sql`, `)})`
}
type AnyColumnLike = typeof rewardNudges.kind

// ─── Shared reads ────────────────────────────────────────────────────────────

/** A booking as the stamp rules read it: its own row and payment. */
async function findJob(conn: Conn, bookingId: string) {
  const [row] = await (conn as typeof db)
    .select({
      id: bookings.id,
      userId: bookings.userId,
      vendorId: bookings.vendorId,
      vehicleId: bookings.vehicleId,
      originalBookingId: bookings.originalBookingId,
      status: bookings.status,
      paymentMethod: bookings.paymentMethod,
      amount: bookings.amount,
      subtotalAmount: bookings.subtotalAmount,
      discountAmount: bookings.discountAmount,
      discountFundedBy: bookings.discountFundedBy,
      markedTestAt: bookings.markedTestAt,
      guaranteeRedo: bookings.guaranteeRedo,
      guaranteeRefundAt: bookings.guaranteeRefundAt,
      noShow: bookings.noShow,
      completedAt: bookings.completedAt,
      deliveredAt: bookings.deliveredAt,
      paymentStatus: payments.status,
      paidAt: payments.paidAt,
      refundedAmount: payments.refundedAmount,
      creditReturnedAt: payments.creditReturnedAt,
    })
    .from(bookings)
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(eq(bookings.id, bookingId))
    .limit(1)
  return row
}

type Job = NonNullable<Awaited<ReturnType<typeof findJob>>>

function jobForRules(job: Job) {
  return {
    status: job.status,
    paymentMethod: job.paymentMethod,
    payment: job.paymentStatus
      ? { status: job.paymentStatus, paidAt: job.paidAt, refundedAmount: job.refundedAmount, creditReturnedAt: job.creditReturnedAt }
      : null,
    markedTest: job.markedTestAt !== null,
    guaranteeRedo: job.guaranteeRedo,
    guaranteeRefund: job.guaranteeRefundAt !== null,
    amount: job.amount,
    subtotalAmount: job.subtotalAmount,
    discountAmount: job.discountAmount,
    discountFundedBy: job.discountFundedBy,
  }
}

const STAMP_COLUMNS = {
  id: rewardStamps.id,
  source: rewardStamps.source,
  earnedAt: rewardStamps.earnedAt,
  expiresAt: rewardStamps.expiresAt,
  voucherId: rewardStamps.voucherId,
  voidedAt: rewardStamps.voidedAt,
  bookingId: rewardStamps.bookingId,
  scratchCardId: rewardStamps.scratchCardId,
  streakMonth: rewardStamps.streakMonth,
  reason: rewardStamps.reason,
  actorName: rewardStamps.actorName,
  voidReason: rewardStamps.voidReason,
}

/** A customer's stamps that can still matter: on the card, or earned in the last 25 months. */
async function listStamps(conn: Conn, userId: string, now: Date) {
  return (conn as typeof db)
    .select(STAMP_COLUMNS)
    .from(rewardStamps)
    .where(
      and(
        eq(rewardStamps.userId, userId),
        sql`(${rewardStamps.earnedAt} > ${monthsBefore(now, 25)} or (${rewardStamps.voucherId} is null and ${rewardStamps.voidedAt} is null and ${rewardStamps.expiresAt} > ${now}))`
      )
    )
    .orderBy(desc(rewardStamps.earnedAt))
}

/**
 * What a level is worked out from: the completion times of the customer's
 * stamp-earning bookings in the level window, and their no-shows in theirs.
 */
async function levelFacts(conn: Conn, userId: string, now: Date, settings: RewardsSettings) {
  const rows = await (conn as typeof db)
    .select({ completedAt: rewardBookings.completedAt })
    .from(rewardBookings)
    .where(
      and(
        eq(rewardBookings.userId, userId),
        eq(rewardBookings.earned, true),
        isNull(rewardBookings.revokedAt),
        gt(rewardBookings.completedAt, monthsBefore(now, settings.levelWindowMonths))
      )
    )
  const [drops] = await (conn as typeof db)
    .select({ n: sql<number>`count(*)::int` })
    .from(rewardLevelDrops)
    .where(and(eq(rewardLevelDrops.userId, userId), gt(rewardLevelDrops.droppedAt, monthsBefore(now, settings.noShowDropMonths))))
  return { completedAt: rows.map((row) => row.completedAt), drops: drops?.n ?? 0 }
}

async function levelOf(conn: Conn, userId: string, now: Date, settings: RewardsSettings): Promise<RewardLevel> {
  const facts = await levelFacts(conn, userId, now, settings)
  return levelFor(facts.completedAt.length, facts.drops, settings)
}

/** The IST months with a stamp-earning booking, over the last 25 months. */
async function earnedMonths(conn: Conn, userId: string, now: Date): Promise<string[]> {
  const rows = await (conn as typeof db)
    .selectDistinct({ month: sql<string>`to_char(${rewardBookings.completedAt} at time zone 'Asia/Kolkata', 'YYYY-MM')` })
    .from(rewardBookings)
    .where(
      and(
        eq(rewardBookings.userId, userId),
        eq(rewardBookings.earned, true),
        isNull(rewardBookings.revokedAt),
        gt(rewardBookings.completedAt, monthsBefore(now, 25))
      )
    )
  return rows.map((row) => row.month)
}

/**
 * Rewards issued in an IST month, in paise, as the cap counts them: every
 * voucher when issued, except scratch prizes, which count when the card was
 * made (whether or not scratched yet), so a prize is never counted twice.
 */
async function issuedInMonthPaise(conn: Conn, monthKey: string): Promise<number> {
  const { start, end } = istMonthRange(monthKey)
  const [vouchers] = await (conn as typeof db)
    .select({ total: sql<string | null>`sum(${rewardVouchers.amount})` })
    .from(rewardVouchers)
    .where(
      and(
        gte(rewardVouchers.issuedAt, start),
        lt(rewardVouchers.issuedAt, end),
        sql`${rewardVouchers.kind} not in ('scratch', 'free_wash')`
      )
    )
  const [cards] = await (conn as typeof db)
    .select({ total: sql<string | null>`sum(${rewardScratchCards.prizeAmount})` })
    .from(rewardScratchCards)
    .where(and(gte(rewardScratchCards.createdAt, start), lt(rewardScratchCards.createdAt, end)))
  return paise(vouchers?.total) + paise(cards?.total)
}

/**
 * A voucher: a once-only, Detlio-funded promo code for this customer
 * (discounts.source 'reward'), and its reward_vouchers row. The code is
 * random; a clash with any code (the case-insensitive unique index) tries
 * another. Its value and expiry are fixed now: later settings never change it.
 */
async function issueVoucher(
  tx: AnyTx,
  input: {
    userId: string
    kind: VoucherKind
    amount: number
    now: Date
    settings: RewardsSettings
    level?: RewardLevel | null
    sourceBookingId?: string | null
    reason?: string
    actorName?: string
  }
) {
  const expiresAt = voucherExpiresAt(input.now, input.settings)
  const amount = rupees(Math.round(input.amount * 100))
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newVoucherCode()
    const [discount] = await tx
      .insert(discounts)
      .values({
        code,
        description: `Detlio Rewards: ${VOUCHER_LABELS[input.kind]}`,
        discountType: 'fixed',
        amountOff: amount,
        perUserLimit: 1,
        totalUsageLimit: 1,
        vendorId: null,
        fundedBy: 'platform',
        startsAt: input.now,
        endsAt: expiresAt,
        isActive: true,
        source: 'reward',
      })
      .onConflictDoNothing()
      .returning({ id: discounts.id })
    if (!discount) continue
    const [voucher] = await tx
      .insert(rewardVouchers)
      .values({
        userId: input.userId,
        kind: input.kind,
        amount,
        discountId: discount.id,
        level: input.level ?? null,
        sourceBookingId: input.sourceBookingId ?? null,
        issuedAt: input.now,
        expiresAt,
        reason: input.reason ?? null,
        actorName: input.actorName ?? null,
      })
      .returning({ id: rewardVouchers.id, kind: rewardVouchers.kind, amount: rewardVouchers.amount })
    return { ...voucher, code }
  }
  throw new Error('reward voucher: no free code after 5 tries')
}

export interface IssuedVoucher {
  id: string
  kind: VoucherKind
  amount: string
  userId: string
}

/**
 * Turns every full Shine Card into a voucher worth the customer's level's
 * card reward, the stamps soonest to lapse first. Inside the customer's lock.
 */
async function convertFullCards(
  tx: AnyTx,
  input: { userId: string; now: Date; settings: RewardsSettings; sourceBookingId?: string | null }
): Promise<IssuedVoucher[]> {
  const { userId, now, settings } = input
  const groups = fullCards((await listStamps(tx, userId, now)) as StampRow[], now, settings)
  if (groups.length === 0) return []
  const level = await levelOf(tx, userId, now, settings)
  const amount = levelSettings(settings, level).cardReward
  const issued: IssuedVoucher[] = []
  for (const group of groups) {
    const voucher = await issueVoucher(tx, { userId, kind: 'shine', amount, now, settings, level, sourceBookingId: input.sourceBookingId })
    await tx
      .update(rewardStamps)
      .set({ voucherId: voucher.id })
      .where(and(inArray(rewardStamps.id, group.map((stamp) => stamp.id)), isNull(rewardStamps.voucherId), isNull(rewardStamps.voidedAt)))
    issued.push({ id: voucher.id, kind: voucher.kind, amount: voucher.amount, userId })
  }
  return issued
}

/** Records the month the cap was reached; true only the first time (one alert). */
async function markCapReached(tx: AnyTx, monthKey: string, now: Date): Promise<boolean> {
  const rows = await tx
    .insert(rewardCapMonths)
    .values({ month: monthKey, reachedAt: now })
    .onConflictDoNothing()
    .returning({ month: rewardCapMonths.month })
  return rows.length > 0
}

async function capCheck(tx: AnyTx, input: { now: Date; settings: RewardsSettings; forced: boolean }) {
  const month = istMonthKey(input.now)
  const issued = await issuedInMonthPaise(tx, month)
  if (input.forced || capReached(issued, input.settings.monthlyCap * 100)) {
    if (await markCapReached(tx, month, input.now)) return { month, issuedPaise: issued }
  }
  return null
}

/** One voucher held by a live booking (or a customer no-show): the voucher is spent. */
function heldBookingOf(discountIdColumn: SQL) {
  return sql`(select dr.booking_id
                from discount_redemptions dr
                join bookings on bookings.id = dr.booking_id
                join payments on payments.booking_id = bookings.id
               where dr.discount_id = ${discountIdColumn} and ${DISCOUNT_HELD}
               limit 1)`
}

// ─── Results ─────────────────────────────────────────────────────────────────

export type JudgeResult =
  | { kind: 'skipped'; why: 'not_found' | 'not_completed' }
  | { kind: 'already' }
  | { kind: 'refused'; userId: string; refusal: StampRefusal }
  | {
      kind: 'earned'
      userId: string
      rootBookingId: string
      streakBonus: number
      scratchCardId: string
      prize: { outcome: ScratchOutcome; drawn: ScratchOutcome; fellBack: boolean }
      vouchers: IssuedVoucher[]
      referral: 'rewarded' | 'refused' | null
      capAlert: { month: string; issuedPaise: number } | null
    }

export type ScratchResult =
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'void' }
  | {
      kind: 'revealed'
      already: boolean
      outcome: ScratchOutcome
      prizeAmount: string | null
      fellBack: boolean
      voucher: { id: string; code: string; amount: string; expiresAt: Date } | null
      vouchers: IssuedVoucher[]
      capAlert: { month: string; issuedPaise: number } | null
    }

/**
 * The rewards writes other rewards modules build on (0054: badges and
 * challenges), so a stamp, a voucher, a full card and the budget work the
 * same everywhere. Each runs inside the caller's transaction, after it took
 * the customer's lock.
 */
export const rewardsTx = {
  lockRewards,
  levelOf,
  levelFacts,
  issueVoucher,
  convertFullCards,
  capCheck,
}

export const rewardsRepository = {
  // ─── Settings ─────────────────────────────────────────────────────────────

  /** The settings in force: the latest version. */
  async latestSettings() {
    const [row] = await db.select().from(rewardSettings).orderBy(desc(rewardSettings.version)).limit(1)
    return row
  },

  async listSettingsVersions(limit: number) {
    return db
      .select({ version: rewardSettings.version, actorName: rewardSettings.actorName, createdAt: rewardSettings.createdAt })
      .from(rewardSettings)
      .orderBy(desc(rewardSettings.version))
      .limit(limit)
  },

  /**
   * Saves a new version, only on top of the one the admin opened (else
   * 'stale'), with the audit row (who, the typed name, before → after) in
   * the same transaction. Under `reward-settings`, taken on its own.
   */
  async saveSettings(input: {
    expectedVersion: number
    settings: RewardsSettings
    actorName: string
    actorSub: string
    now: Date
  }): Promise<{ kind: 'saved'; version: number } | { kind: 'stale'; version: number } | { kind: 'unchanged'; version: number }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('reward-settings')::bigint)`)
      const [current] = await tx.select().from(rewardSettings).orderBy(desc(rewardSettings.version)).limit(1)
      const currentVersion = current?.version ?? 0
      if (currentVersion !== input.expectedVersion) return { kind: 'stale' as const, version: currentVersion }
      const changes = current ? settingsChanges(current.settings, input.settings) : []
      if (current && changes.length === 0) return { kind: 'unchanged' as const, version: currentVersion }
      const version = currentVersion + 1
      await tx.insert(rewardSettings).values({
        version,
        settings: input.settings,
        actorName: input.actorName,
        actorSub: input.actorSub,
        createdAt: input.now,
      })
      await tx.insert(adminAuditLog).values({
        action: 'reward_settings_changed',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { version, previousVersion: currentVersion, changed: changes.length },
        detail: { changes },
      })
      return { kind: 'saved' as const, version }
    })
  },

  // ─── Earning ──────────────────────────────────────────────────────────────

  /**
   * Judges one completed booking chain, once: a stamp (with its scratch
   * card, any streak bonus, full Shine Cards and an invite to settle) or
   * the reason for none, in one transaction under the customer's lock.
   * `draw` draws the scratch card's prize for the customer's level (crypto
   * in production, seeded in tests).
   */
  async judgeCompletion(input: {
    bookingId: string
    now: Date
    settings: RewardsSettings
    draw: (level: RewardLevel) => { outcome: ScratchOutcome; amount: number | null }
  }): Promise<JudgeResult> {
    const first = await findJob(db, input.bookingId)
    if (!first) return { kind: 'skipped', why: 'not_found' }
    if (first.status !== 'completed') return { kind: 'skipped', why: 'not_completed' }
    const { now, settings } = input

    return db.transaction(async (tx): Promise<JudgeResult> => {
      await lockRewards(tx, first.userId)
      const job = await findJob(tx, input.bookingId)
      if (!job || job.status !== 'completed') return { kind: 'skipped', why: 'not_completed' }
      const rootBookingId = job.originalBookingId ?? job.id

      const [done] = await tx
        .select({ id: rewardBookings.rootBookingId })
        .from(rewardBookings)
        .where(eq(rewardBookings.rootBookingId, rootBookingId))
        .limit(1)
      if (done) return { kind: 'already' }

      // An invite to settle: its inviter's lock now, before the cap's.
      const [pendingInvite] = await tx
        .select({ id: rewardReferrals.id, referrerId: rewardReferrals.referrerId })
        .from(rewardReferrals)
        .where(and(eq(rewardReferrals.refereeId, job.userId), eq(rewardReferrals.status, 'pending')))
        .limit(1)
      if (pendingInvite) await lockReferrer(tx, pendingInvite.referrerId)

      const completedAt = job.completedAt ?? job.deliveredAt ?? now
      const istDay = istDateKey(completedAt)
      const [sameDay] = await tx
        .select({ id: rewardBookings.rootBookingId })
        .from(rewardBookings)
        .where(and(eq(rewardBookings.vehicleId, job.vehicleId), eq(rewardBookings.istDay, istDay), eq(rewardBookings.earned, true)))
        .limit(1)

      const rules = jobForRules(job)
      const refusal = stampRefusal(rules, { sameDayCar: Boolean(sameDay) }, settings)
      await tx.insert(rewardBookings).values({
        rootBookingId,
        bookingId: job.id,
        userId: job.userId,
        vehicleId: job.vehicleId,
        vendorId: job.vendorId,
        completedAt,
        istDay,
        eligibleAmount: rupees(eligibleAmountPaise(rules)),
        discountPercent: discountPercent(rules),
        earned: refusal === null,
        refusal,
        judgedAt: now,
      })
      if (refusal) return { kind: 'refused', userId: job.userId, refusal }

      await tx.insert(rewardStamps).values({
        userId: job.userId,
        source: 'booking',
        bookingId: rootBookingId,
        earnedAt: now,
        expiresAt: stampExpiresAt(now, settings),
      })

      // A stamp-earning booking in N months in a row: bonus stamps, once a month.
      let streakBonus = 0
      const month = istMonthKey(completedAt)
      if (streakBonusDue(await earnedMonths(tx, job.userId, now), month, settings)) {
        const [taken] = await tx
          .select({ id: rewardStamps.id })
          .from(rewardStamps)
          .where(and(eq(rewardStamps.userId, job.userId), eq(rewardStamps.source, 'streak'), eq(rewardStamps.streakMonth, month)))
          .limit(1)
        if (!taken) {
          // The first carries the month (unique), any more are adjustments-free extras of it.
          await tx.insert(rewardStamps).values({
            userId: job.userId,
            source: 'streak',
            streakMonth: month,
            earnedAt: now,
            expiresAt: stampExpiresAt(now, settings),
          })
          streakBonus = 1
          for (let i = 1; i < settings.streakBonusStamps; i += 1) {
            await tx.insert(rewardStamps).values({
              userId: job.userId,
              source: 'adjustment',
              earnedAt: now,
              expiresAt: stampExpiresAt(now, settings),
              reason: `Monthly streak bonus (${month})`,
              actorName: 'Detlio Rewards',
            })
            streakBonus += 1
          }
        }
      }

      // The scratch card: the prize is decided now, with the level's odds. A
      // money prize that would take the month past the cap is a bonus stamp.
      const level = await levelOf(tx, job.userId, now, settings)
      const drawn = input.draw(level)
      let prize: { outcome: ScratchOutcome; amount: number | null; fellBack: boolean } = { ...drawn, fellBack: false }
      let capHit = false
      if (drawn.amount !== null) {
        await lockCap(tx)
        const issued = await issuedInMonthPaise(tx, istMonthKey(now))
        prize = prizeWithinCap(drawn, { issuedThisMonthPaise: issued, capPaise: settings.monthlyCap * 100 })
        capHit = prize.fellBack
      }
      const [card] = await tx
        .insert(rewardScratchCards)
        .values({
          userId: job.userId,
          rootBookingId,
          outcome: prize.outcome,
          prizeAmount: prize.amount === null ? null : rupees(prize.amount * 100),
          drawnOutcome: drawn.outcome,
          fellBack: prize.fellBack,
          level,
          createdAt: now,
          expiresAt: scratchCardExpiresAt(now, settings),
        })
        .returning({ id: rewardScratchCards.id })

      const vouchers = await convertFullCards(tx, { userId: job.userId, now, settings, sourceBookingId: rootBookingId })

      // Invite a friend: settled on the new customer's first stamp-earning booking.
      let referral: 'rewarded' | 'refused' | null = null
      if (pendingInvite) {
        const [earlier] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(rewardBookings)
          .where(and(eq(rewardBookings.userId, job.userId), eq(rewardBookings.earned, true)))
        if ((earlier?.n ?? 0) === 1) {
          const [car] = await tx
            .select({ plate: userVehicles.licensePlate })
            .from(userVehicles)
            .where(eq(userVehicles.id, job.vehicleId))
            .limit(1)
          const theirCars = await tx
            .select({ plate: userVehicles.licensePlate })
            .from(userVehicles)
            .where(eq(userVehicles.userId, pendingInvite.referrerId))
          const [rewarded] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(rewardReferrals)
            .where(
              and(
                eq(rewardReferrals.referrerId, pendingInvite.referrerId),
                eq(rewardReferrals.status, 'rewarded'),
                sql`${rewardReferrals.referrerVoucherId} is not null`,
                gte(rewardReferrals.settledAt, istYearStart(now))
              )
            )
          const outcome = referralOutcome(
            {
              refereePlate: car?.plate ?? null,
              referrerPlates: theirCars.map((row) => row.plate),
              referrerRewardedThisYear: rewarded?.n ?? 0,
            },
            settings
          )
          if (outcome.kind === 'refuse') {
            await tx
              .update(rewardReferrals)
              .set({ status: 'refused', refusal: outcome.reason, settledAt: now, rootBookingId })
              .where(and(eq(rewardReferrals.id, pendingInvite.id), eq(rewardReferrals.status, 'pending')))
            referral = 'refused'
          } else {
            const amount = settings.referralAmount
            const mine = await issueVoucher(tx, { userId: job.userId, kind: 'referral', amount, now, settings, sourceBookingId: rootBookingId })
            vouchers.push({ id: mine.id, kind: mine.kind, amount: mine.amount, userId: job.userId })
            const theirs = outcome.referrer
              ? await issueVoucher(tx, { userId: pendingInvite.referrerId, kind: 'referral', amount, now, settings, sourceBookingId: rootBookingId })
              : null
            if (theirs) vouchers.push({ id: theirs.id, kind: theirs.kind, amount: theirs.amount, userId: pendingInvite.referrerId })
            await tx
              .update(rewardReferrals)
              .set({ status: 'rewarded', settledAt: now, rootBookingId, refereeVoucherId: mine.id, referrerVoucherId: theirs?.id ?? null })
              .where(and(eq(rewardReferrals.id, pendingInvite.id), eq(rewardReferrals.status, 'pending')))
            referral = 'rewarded'
          }
        }
      }

      // Shine and invite vouchers are honoured past the cap; the month that
      // reaches it is recorded once, for one alert.
      const capAlert =
        capHit || vouchers.length > 0 || prize.amount !== null ? await capCheck(tx, { now, settings, forced: capHit }) : null

      return {
        kind: 'earned',
        userId: job.userId,
        rootBookingId,
        streakBonus,
        scratchCardId: card.id,
        prize: { outcome: prize.outcome, drawn: drawn.outcome, fellBack: prize.fellBack },
        vouchers,
        referral,
        capAlert,
      }
    })
  },

  /**
   * Scratches a card: once, by its owner, before it lapses. A money prize
   * becomes a voucher (counted toward the cap when the card was made, not
   * again); a bonus stamp goes on the Shine Card, which may fill it.
   * Scratching again answers the same prize.
   */
  async scratch(input: { userId: string; cardId: string; now: Date; settings: RewardsSettings }): Promise<ScratchResult> {
    const { now, settings } = input
    return db.transaction(async (tx): Promise<ScratchResult> => {
      await lockRewards(tx, input.userId)
      const [card] = await tx
        .select()
        .from(rewardScratchCards)
        .where(and(eq(rewardScratchCards.id, input.cardId), eq(rewardScratchCards.userId, input.userId)))
        .limit(1)
      if (!card) return { kind: 'not_found' }
      if (card.voidedAt) return { kind: 'void' }

      const voucherOf = async (voucherId: string | null) => {
        if (!voucherId) return null
        const [row] = await tx
          .select({ id: rewardVouchers.id, amount: rewardVouchers.amount, expiresAt: rewardVouchers.expiresAt, code: discounts.code })
          .from(rewardVouchers)
          .innerJoin(discounts, eq(discounts.id, rewardVouchers.discountId))
          .where(eq(rewardVouchers.id, voucherId))
          .limit(1)
        return row ?? null
      }

      if (card.scratchedAt) {
        return {
          kind: 'revealed',
          already: true,
          outcome: card.outcome,
          prizeAmount: card.prizeAmount,
          fellBack: card.fellBack,
          voucher: await voucherOf(card.voucherId),
          vouchers: [],
          capAlert: null,
        }
      }
      if (card.expiresAt <= now) return { kind: 'expired' }

      let voucherId: string | null = null
      const vouchers: IssuedVoucher[] = []
      const kind = scratchVoucherKind(card.outcome)
      if (kind && card.prizeAmount) {
        const voucher = await issueVoucher(tx, {
          userId: input.userId,
          kind,
          amount: Number(card.prizeAmount),
          now,
          settings,
          level: card.level,
          sourceBookingId: card.rootBookingId,
        })
        voucherId = voucher.id
        vouchers.push({ id: voucher.id, kind: voucher.kind, amount: voucher.amount, userId: input.userId })
      } else {
        await tx.insert(rewardStamps).values({
          userId: input.userId,
          source: 'scratch',
          scratchCardId: card.id,
          earnedAt: now,
          expiresAt: stampExpiresAt(now, settings),
        })
      }
      await tx
        .update(rewardScratchCards)
        .set({ scratchedAt: now, voucherId })
        .where(and(eq(rewardScratchCards.id, card.id), isNull(rewardScratchCards.scratchedAt)))
      let capAlert = null
      if (!kind) {
        const shine = await convertFullCards(tx, { userId: input.userId, now, settings, sourceBookingId: card.rootBookingId })
        vouchers.push(...shine)
        if (shine.length > 0) capAlert = await capCheck(tx, { now, settings, forced: false })
      }

      return {
        kind: 'revealed',
        already: false,
        outcome: card.outcome,
        prizeAmount: card.prizeAmount,
        fellBack: card.fellBack,
        voucher: await voucherOf(voucherId),
        vouchers,
        capAlert,
      }
    })
  },

  /** A customer no-show (recorded by Detlio): one level off, once per chain, with the level before and after. */
  async recordNoShow(bookingId: string, now: Date, settings: RewardsSettings) {
    const first = await findJob(db, bookingId)
    if (!first || first.status !== 'cancelled' || first.noShow !== 'customer') return null
    return db.transaction(async (tx) => {
      await lockRewards(tx, first.userId)
      const facts = await levelFacts(tx, first.userId, now, settings)
      const from = levelFor(facts.completedAt.length, facts.drops, settings)
      const to = levelFor(facts.completedAt.length, facts.drops + 1, settings)
      const rows = await tx
        .insert(rewardLevelDrops)
        .values({ userId: first.userId, rootBookingId: first.originalBookingId ?? first.id, fromLevel: from, toLevel: to, droppedAt: now })
        .onConflictDoNothing()
        .returning({ id: rewardLevelDrops.id })
      return rows.length > 0 ? { userId: first.userId, from, to } : null
    })
  },

  /**
   * A level perk (birthday or annual detailing voucher), once per IST
   * calendar year, under the customer's lock. `amountFor` decides with the
   * customer's level and birthday read inside the lock; null = not due.
   */
  async grantPerk(input: {
    userId: string
    kind: PerkKind
    now: Date
    settings: RewardsSettings
    amountFor: (facts: { level: RewardLevel; birthdayMonth: number | null; givenThisYear: boolean }) => number | null
  }) {
    const { now, settings } = input
    return db.transaction(async (tx) => {
      await lockRewards(tx, input.userId)
      const year = istParts(now).year
      const [given] = await tx
        .select({ id: rewardPerks.id })
        .from(rewardPerks)
        .where(and(eq(rewardPerks.userId, input.userId), eq(rewardPerks.kind, input.kind), eq(rewardPerks.year, year)))
        .limit(1)
      const [user] = await tx.select({ birthdayMonth: users.birthdayMonth }).from(users).where(eq(users.id, input.userId)).limit(1)
      if (!user) return null
      const level = await levelOf(tx, input.userId, now, settings)
      const amount = input.amountFor({ level, birthdayMonth: user.birthdayMonth, givenThisYear: Boolean(given) })
      if (amount === null) return null
      const voucher = await issueVoucher(tx, { userId: input.userId, kind: input.kind, amount, now, settings, level })
      await tx.insert(rewardPerks).values({ userId: input.userId, kind: input.kind, year, level, voucherId: voucher.id, createdAt: now })
      const capAlert = await capCheck(tx, { now, settings, forced: false })
      return { voucher: { id: voucher.id, kind: voucher.kind, amount: voucher.amount, userId: input.userId } as IssuedVoucher, level, capAlert }
    })
  },

  /**
   * Customers a perk may be due to this year: at least `minBookings`
   * stamp-earning bookings in the window, no such perk yet this year, and
   * for a birthday, born this IST month. The level is decided in the lock.
   */
  async perkCandidates(input: { kind: PerkKind; minBookings: number; now: Date; settings: RewardsSettings; limit: number }) {
    const year = istParts(input.now).year
    const month = istParts(input.now).month + 1
    const rows = await db.execute<{ user_id: string }>(sql`
      select rb.user_id
        from reward_bookings rb
        join users u on u.id = rb.user_id
       where rb.earned and rb.revoked_at is null
         and rb.completed_at > ${monthsBefore(input.now, input.settings.levelWindowMonths)}
         ${input.kind === 'birthday' ? sql`and u.birthday_month = ${month}` : sql``}
         and not exists (
           select 1 from reward_perks p where p.user_id = rb.user_id and p.kind = ${input.kind} and p.year = ${year}
         )
       group by rb.user_id
      having count(*) >= ${input.minBookings}
       limit ${input.limit}
    `)
    return Array.from(rows).map((row) => row.user_id)
  },

  /** Completions of the last `since` with no judgement yet (the cron's catch-up). */
  async listUnjudgedCompletions(since: Date, limit: number): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select b.id
        from bookings b
       where b.status = 'completed'
         and coalesce(b.completed_at, b.delivered_at) >= ${since}
         and not exists (select 1 from bookings later where later.rescheduled_from_id = b.id)
         and not exists (
           select 1 from reward_bookings rb where rb.root_booking_id = coalesce(b.original_booking_id, b.id)
         )
       order by coalesce(b.completed_at, b.delivered_at)
       limit ${limit}
    `)
    return Array.from(rows).map((row) => row.id)
  },

  /** Customer no-shows of the last `since` with no level drop recorded (the cron's catch-up). */
  async listUnrecordedNoShows(since: Date, limit: number): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select b.id
        from bookings b
       where b.no_show = 'customer'
         and b.no_show_marked_at >= ${since}
         and not exists (
           select 1 from reward_level_drops d where d.root_booking_id = coalesce(b.original_booking_id, b.id)
         )
       order by b.no_show_marked_at
       limit ${limit}
    `)
    return Array.from(rows).map((row) => row.id)
  },

  /**
   * Stamp-earning bookings since marked Test or with money gone back (or
   * a Detlio Guarantee refund instead approved, 0051): the stamp is taken
   * back if still on the card, an unscratched card voided. A voucher the
   * stamp already helped fill stays.
   */
  async listToRevoke(limit: number) {
    const rows = await db.execute<{ root_booking_id: string; user_id: string }>(sql`
      select rb.root_booking_id, rb.user_id
        from reward_bookings rb
        join bookings b on b.id = rb.booking_id
        left join payments p on p.booking_id = rb.booking_id
       where rb.earned
         and rb.revoked_at is null
         and (
           b.marked_test_at is not null
           or b.guarantee_refund_at is not null
           or p.status = 'refunded'
           or coalesce(p.refunded_amount, 0) > 0
           or p.credit_returned_at is not null
         )
       limit ${limit}
    `)
    return Array.from(rows).map((row) => ({ rootBookingId: row.root_booking_id, userId: row.user_id }))
  },

  /** A booking's stamp-earning judgement still standing (to revoke it at once), or null. */
  async findEarnedForBooking(bookingId: string) {
    const [row] = await db
      .select({ rootBookingId: rewardBookings.rootBookingId, userId: rewardBookings.userId })
      .from(rewardBookings)
      .where(
        and(
          or(eq(rewardBookings.bookingId, bookingId), eq(rewardBookings.rootBookingId, bookingId)),
          eq(rewardBookings.earned, true),
          isNull(rewardBookings.revokedAt)
        )
      )
      .limit(1)
    return row ?? null
  },

  async revoke(input: { rootBookingId: string; userId: string; now: Date }) {
    return db.transaction(async (tx) => {
      await lockRewards(tx, input.userId)
      const [rb] = await tx
        .select({ bookingId: rewardBookings.bookingId, revokedAt: rewardBookings.revokedAt, earned: rewardBookings.earned })
        .from(rewardBookings)
        .where(eq(rewardBookings.rootBookingId, input.rootBookingId))
        .limit(1)
      if (!rb || !rb.earned || rb.revokedAt) return null
      const job = await findJob(tx, rb.bookingId)
      if (!job) return null
      const reason = stampRevocation(jobForRules(job))
      if (!reason) return null
      await tx
        .update(rewardBookings)
        .set({ revokedAt: input.now, revokeReason: reason })
        .where(and(eq(rewardBookings.rootBookingId, input.rootBookingId), isNull(rewardBookings.revokedAt)))
      const voided = await tx
        .update(rewardStamps)
        .set({ voidedAt: input.now, voidReason: reason === 'test' ? 'Booking marked as a test' : 'Booking refunded' })
        .where(
          and(
            eq(rewardStamps.bookingId, input.rootBookingId),
            eq(rewardStamps.source, 'booking'),
            isNull(rewardStamps.voucherId),
            isNull(rewardStamps.voidedAt)
          )
        )
        .returning({ id: rewardStamps.id })
      const cards = await tx
        .update(rewardScratchCards)
        .set({ voidedAt: input.now })
        .where(
          and(
            eq(rewardScratchCards.rootBookingId, input.rootBookingId),
            isNull(rewardScratchCards.scratchedAt),
            isNull(rewardScratchCards.voidedAt)
          )
        )
        .returning({ id: rewardScratchCards.id })
      return { reason, stampVoided: voided.length > 0, cardVoided: cards.length > 0 }
    })
  },

  // ─── The customer's own view ──────────────────────────────────────────────

  listStamps(userId: string, now: Date) {
    return listStamps(db, userId, now)
  },

  levelFacts(userId: string, now: Date, settings: RewardsSettings) {
    return levelFacts(db, userId, now, settings)
  },

  earnedMonths(userId: string, now: Date) {
    return earnedMonths(db, userId, now)
  },

  /** The customer's vouchers still good or issued in the last 180 days (the held booking named when spent), newest first. */
  async listVouchers(userId: string, now: Date) {
    const rows = await db.execute<{
      id: string
      kind: VoucherKind
      amount: string
      code: string
      level: RewardLevel | null
      source_booking_id: string | null
      issued_at: Date | string
      expires_at: Date | string
      cancelled_at: Date | string | null
      reason: string | null
      actor_name: string | null
      held_booking_id: string | null
    }>(sql`
      select v.id, v.kind, v.amount, d.code, v.level, v.source_booking_id, v.issued_at, v.expires_at, v.cancelled_at,
             v.reason, v.actor_name, ${heldBookingOf(sql.raw('v.discount_id'))} as held_booking_id
        from reward_vouchers v
        join discounts d on d.id = v.discount_id
       where v.user_id = ${userId}
         and (v.issued_at > ${new Date(now.getTime() - 180 * DAY_MS)} or v.expires_at > ${now})
       order by v.issued_at desc
       limit 60
    `)
    return Array.from(rows).map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: Number(row.amount).toFixed(2),
      code: row.code,
      level: row.level,
      sourceBookingId: row.source_booking_id,
      issuedAt: new Date(row.issued_at),
      expiresAt: new Date(row.expires_at),
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
      reason: row.reason,
      actorName: row.actor_name,
      heldBookingId: row.held_booking_id,
    }))
  },

  /** The customer's scratch cards of the last 90 days, and any still waiting. */
  async listScratchCards(userId: string, now: Date) {
    return db
      .select({
        id: rewardScratchCards.id,
        rootBookingId: rewardScratchCards.rootBookingId,
        bookingId: rewardBookings.bookingId,
        outcome: rewardScratchCards.outcome,
        drawnOutcome: rewardScratchCards.drawnOutcome,
        prizeAmount: rewardScratchCards.prizeAmount,
        fellBack: rewardScratchCards.fellBack,
        level: rewardScratchCards.level,
        createdAt: rewardScratchCards.createdAt,
        expiresAt: rewardScratchCards.expiresAt,
        scratchedAt: rewardScratchCards.scratchedAt,
        voidedAt: rewardScratchCards.voidedAt,
        voucherId: rewardScratchCards.voucherId,
        vendorName: vendors.businessName,
      })
      .from(rewardScratchCards)
      .leftJoin(rewardBookings, eq(rewardBookings.rootBookingId, rewardScratchCards.rootBookingId))
      .leftJoin(vendors, eq(vendors.id, rewardBookings.vendorId))
      .where(
        and(
          eq(rewardScratchCards.userId, userId),
          sql`(${rewardScratchCards.createdAt} > ${new Date(now.getTime() - 90 * DAY_MS)} or (${rewardScratchCards.scratchedAt} is null and ${rewardScratchCards.voidedAt} is null and ${rewardScratchCards.expiresAt} > ${now}))`
        )
      )
      .orderBy(desc(rewardScratchCards.createdAt))
      .limit(30)
  },

  /** The customer's latest judged bookings, for their history. */
  listJudged(userId: string, limit: number) {
    return db
      .select({
        rootBookingId: rewardBookings.rootBookingId,
        bookingId: rewardBookings.bookingId,
        completedAt: rewardBookings.completedAt,
        earned: rewardBookings.earned,
        refusal: rewardBookings.refusal,
        revokedAt: rewardBookings.revokedAt,
        revokeReason: rewardBookings.revokeReason,
        eligibleAmount: rewardBookings.eligibleAmount,
        discountPercent: rewardBookings.discountPercent,
        vendorName: vendors.businessName,
      })
      .from(rewardBookings)
      .leftJoin(vendors, eq(vendors.id, rewardBookings.vendorId))
      .where(eq(rewardBookings.userId, userId))
      .orderBy(desc(rewardBookings.completedAt))
      .limit(limit)
  },

  listLevelDrops(userId: string, limit: number) {
    return db
      .select({
        id: rewardLevelDrops.id,
        rootBookingId: rewardLevelDrops.rootBookingId,
        fromLevel: rewardLevelDrops.fromLevel,
        toLevel: rewardLevelDrops.toLevel,
        droppedAt: rewardLevelDrops.droppedAt,
      })
      .from(rewardLevelDrops)
      .where(eq(rewardLevelDrops.userId, userId))
      .orderBy(desc(rewardLevelDrops.droppedAt))
      .limit(limit)
  },

  /**
   * The lifetime line: what Detlio Rewards vouchers saved on bookings that
   * kept them (DISCOUNT_HELD: completed, live or a customer no-show), every
   * stamp-earning booking ever, and the first one.
   */
  async lifetime(userId: string) {
    const [saved] = await db.execute<{ total: string | null }>(sql`
      select sum(dr.discount_amount) as total
        from discount_redemptions dr
        join discounts d on d.id = dr.discount_id and d.source = 'reward'
        join bookings on bookings.id = dr.booking_id
        join payments on payments.booking_id = bookings.id
       where dr.user_id = ${userId} and ${DISCOUNT_HELD}
    `)
    const [earned] = await db
      .select({ n: sql<number>`count(*)::int`, since: sql<Date | string | null>`min(${rewardBookings.completedAt})` })
      .from(rewardBookings)
      .where(and(eq(rewardBookings.userId, userId), eq(rewardBookings.earned, true), isNull(rewardBookings.revokedAt)))
    return {
      saved: Number(saved?.total ?? 0).toFixed(2),
      washes: earned?.n ?? 0,
      since: earned?.since ? new Date(earned.since) : null,
    }
  },

  async findBirthday(userId: string) {
    const [row] = await db
      .select({ month: users.birthdayMonth, day: users.birthdayDay })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return row && row.month && row.day ? { month: row.month, day: row.day } : null
  },

  async setBirthday(userId: string, birthday: { month: number; day: number } | null) {
    await db
      .update(users)
      .set({ birthdayMonth: birthday?.month ?? null, birthdayDay: birthday?.day ?? null })
      .where(eq(users.id, userId))
  },

  async findReferralCode(userId: string) {
    const [row] = await db
      .select({ code: rewardReferralCodes.code })
      .from(rewardReferralCodes)
      .where(eq(rewardReferralCodes.userId, userId))
      .limit(1)
    return row?.code ?? null
  },

  /** The customer's invite code, made once (a clash with another code tries again). */
  async ensureReferralCode(userId: string, makeCode: () => string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await rewardsRepository.findReferralCode(userId)
      if (existing) return existing
      await db.insert(rewardReferralCodes).values({ userId, code: makeCode() }).onConflictDoNothing()
    }
    const code = await rewardsRepository.findReferralCode(userId)
    if (!code) throw new Error('reward referral code: no free code after 5 tries')
    return code
  },

  async findReferrerByCode(code: string) {
    const [row] = await db
      .select({ userId: rewardReferralCodes.userId, name: users.name })
      .from(rewardReferralCodes)
      .innerJoin(users, eq(users.id, rewardReferralCodes.userId))
      .where(eq(rewardReferralCodes.code, code))
      .limit(1)
    return row
  },

  /** An invite page opened: the inviter and when, for the funnel. */
  async recordInviteOpen(referrerId: string, now: Date) {
    await db.insert(rewardInviteOpens).values({ referrerId, openedAt: now })
  },

  /** The inviter's invites: rewarded this IST year, and still waiting. */
  async referralCounts(referrerId: string, now: Date) {
    const [row] = await db
      .select({
        rewardedThisYear: sql<number>`count(*) filter (where ${rewardReferrals.status} = 'rewarded' and ${rewardReferrals.referrerVoucherId} is not null and ${rewardReferrals.settledAt} >= ${istYearStart(now)})::int`,
        pending: sql<number>`count(*) filter (where ${rewardReferrals.status} = 'pending')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(rewardReferrals)
      .where(eq(rewardReferrals.referrerId, referrerId))
    return { rewardedThisYear: row?.rewardedThisYear ?? 0, pending: row?.pending ?? 0, total: row?.total ?? 0 }
  },

  /** The invite this customer took up, if any. */
  async findReferralOf(refereeId: string) {
    const [row] = await db
      .select({ id: rewardReferrals.id, status: rewardReferrals.status, referrerName: users.name })
      .from(rewardReferrals)
      .innerJoin(users, eq(users.id, rewardReferrals.referrerId))
      .where(eq(rewardReferrals.refereeId, refereeId))
      .limit(1)
    return row
  },

  /** What deciding an invite claim needs about the new customer. */
  async claimFacts(userId: string, phoneHash: string) {
    const [referred] = await db
      .select({ id: rewardReferrals.id })
      .from(rewardReferrals)
      .where(eq(rewardReferrals.refereeId, userId))
      .limit(1)
    const [seen] = await db
      .select({ id: rewardReferrals.id })
      .from(rewardReferrals)
      .where(eq(rewardReferrals.refereePhoneHash, phoneHash))
      .limit(1)
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.userId, userId)).limit(1)
    return { alreadyReferred: Boolean(referred), phoneSeen: Boolean(seen), hasBookings: Boolean(booking) }
  },

  async findUserPhone(userId: string) {
    const [row] = await db.select({ phone: users.phone, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1)
    return row
  },

  /** Records an invite taken up; false when a race already recorded one (unique indexes). */
  async insertReferral(input: { referrerId: string; refereeId: string; phoneHash: string; openedAt: Date; now: Date }) {
    const rows = await db
      .insert(rewardReferrals)
      .values({
        referrerId: input.referrerId,
        refereeId: input.refereeId,
        refereePhoneHash: input.phoneHash,
        inviteOpenedAt: input.openedAt,
        claimedAt: input.now,
      })
      .onConflictDoNothing()
      .returning({ id: rewardReferrals.id })
    return rows.length > 0
  },

  // ─── Garages ──────────────────────────────────────────────────────────────

  /**
   * What each customer's level is worked out from, for many at once (the
   * garage's job cards): stamp-earning bookings in the window and no-shows
   * in theirs. Two grouped reads.
   */
  async levelFactsMany(userIds: string[], now: Date, settings: RewardsSettings) {
    if (userIds.length === 0) return new Map<string, { bookings: number; drops: number }>()
    const earned = await db
      .select({ userId: rewardBookings.userId, n: sql<number>`count(*)::int` })
      .from(rewardBookings)
      .where(
        and(
          inArray(rewardBookings.userId, userIds),
          eq(rewardBookings.earned, true),
          isNull(rewardBookings.revokedAt),
          gt(rewardBookings.completedAt, monthsBefore(now, settings.levelWindowMonths))
        )
      )
      .groupBy(rewardBookings.userId)
    const drops = await db
      .select({ userId: rewardLevelDrops.userId, n: sql<number>`count(*)::int` })
      .from(rewardLevelDrops)
      .where(and(inArray(rewardLevelDrops.userId, userIds), gt(rewardLevelDrops.droppedAt, monthsBefore(now, settings.noShowDropMonths))))
      .groupBy(rewardLevelDrops.userId)
    const map = new Map<string, { bookings: number; drops: number }>()
    for (const row of earned) map.set(row.userId, { bookings: row.n, drops: 0 })
    for (const row of drops) map.set(row.userId, { bookings: map.get(row.userId)?.bookings ?? 0, drops: row.n })
    return map
  },

  // ─── Updates ──────────────────────────────────────────────────────────────

  /** Rewards news of the Updates window: cards made, vouchers issued (not scratch prizes), nudges sent. */
  async listHubEvents(userId: string, since: Date) {
    const cards = await db
      .select({ id: rewardScratchCards.id, createdAt: rewardScratchCards.createdAt })
      .from(rewardScratchCards)
      .where(and(eq(rewardScratchCards.userId, userId), gte(rewardScratchCards.createdAt, since), isNull(rewardScratchCards.voidedAt)))
      .orderBy(desc(rewardScratchCards.createdAt))
      .limit(10)
    const vouchers = await db
      .select({ id: rewardVouchers.id, kind: rewardVouchers.kind, amount: rewardVouchers.amount, issuedAt: rewardVouchers.issuedAt })
      .from(rewardVouchers)
      .where(
        and(
          eq(rewardVouchers.userId, userId),
          gte(rewardVouchers.issuedAt, since),
          sql`${rewardVouchers.kind} not in ('scratch', 'free_wash')`
        )
      )
      .orderBy(desc(rewardVouchers.issuedAt))
      .limit(10)
    const nudges = await db
      .select({ id: rewardNudges.id, kind: rewardNudges.kind, title: rewardNudges.title, body: rewardNudges.body, linkUrl: rewardNudges.linkUrl, sentAt: rewardNudges.sentAt })
      .from(rewardNudges)
      .where(and(eq(rewardNudges.userId, userId), gte(rewardNudges.sentAt, since)))
      .orderBy(desc(rewardNudges.sentAt))
      .limit(10)
    return { cards, vouchers, nudges }
  },

  // ─── Nudges ───────────────────────────────────────────────────────────────

  /**
   * Customers a nudge may go to now, per kind, each with what it is about.
   * All leave out anyone nudged within the gap and any subject already
   * nudged; bounded.
   */
  async nudgeCandidates(now: Date, limit: number, settings: RewardsSettings) {
    const soon = new Date(now.getTime() + settings.expiryWarningDays * DAY_MS)
    const quietSince = new Date(now.getTime() - settings.nudgeGapDays * DAY_MS)
    const notRecentlyNudged = (userColumn: ReturnType<typeof sql.raw>) =>
      sql`not exists (select 1 from reward_nudges n where n.user_id = ${userColumn} and n.sent_at > ${quietSince} and ${countsTowardGap(sql.raw('n.kind'))})`

    const vouchers = await db.execute<{ id: string; user_id: string; amount: string; expires_at: Date | string }>(sql`
      select v.id, v.user_id, v.amount, v.expires_at
        from reward_vouchers v
       where v.cancelled_at is null
         and v.expires_at > ${now} and v.expires_at <= ${soon}
         and ${heldBookingOf(sql.raw('v.discount_id'))} is null
         and ${notRecentlyNudged(sql.raw('v.user_id'))}
         and not exists (select 1 from reward_nudges n where n.user_id = v.user_id and n.kind = 'expiring' and n.subject_key = 'voucher:' || v.id)
       order by v.expires_at
       limit ${limit}
    `)
    const cards = await db.execute<{ id: string; user_id: string; expires_at: Date | string }>(sql`
      select c.id, c.user_id, c.expires_at
        from reward_scratch_cards c
       where c.scratched_at is null and c.voided_at is null
         and c.expires_at > ${now} and c.expires_at <= ${soon}
         and ${notRecentlyNudged(sql.raw('c.user_id'))}
         and not exists (select 1 from reward_nudges n where n.user_id = c.user_id and n.kind = 'expiring' and n.subject_key = 'card:' || c.id)
       order by c.expires_at
       limit ${limit}
    `)
    const stamps = await db.execute<{ user_id: string; first_expiry: Date | string; count: number }>(sql`
      select s.user_id, min(s.expires_at) as first_expiry, count(*)::int as count
        from reward_stamps s
       where s.voucher_id is null and s.voided_at is null
         and s.expires_at > ${now} and s.expires_at <= ${soon}
         and ${notRecentlyNudged(sql.raw('s.user_id'))}
       group by s.user_id
       order by min(s.expires_at)
       limit ${limit}
    `)
    const oneAway = await db.execute<{ user_id: string; newest_id: string }>(sql`
      select s.user_id, (array_agg(s.id order by s.earned_at desc, s.id desc))[1] as newest_id
        from reward_stamps s
       where s.voucher_id is null and s.voided_at is null and s.expires_at > ${now}
         and ${notRecentlyNudged(sql.raw('s.user_id'))}
       group by s.user_id
      having count(*) = ${settings.stampsPerCard - 1}
       limit ${limit}
    `)
    // Cars of customers in the programme (a stamp in the last 6 months),
    // their last wash as the wash bar counts it, and no paid booking to come.
    const washDue = await db.execute<{
      user_id: string
      vehicle_id: string
      washed_at: Date | string
      wash_interval_days: number | null
      on_card: number
    }>(sql`
      with members as (
        select distinct rb.user_id
          from reward_bookings rb
         where rb.earned and rb.revoked_at is null
           and rb.completed_at > ${monthsBefore(now, 6)}
      ),
      last_wash as (
        select distinct on (b.vehicle_id) b.vehicle_id, b.user_id, coalesce(b.completed_at, b.scheduled_at) as washed_at
          from bookings b
          join members m on m.user_id = b.user_id
         where b.status = 'completed'
           and exists (
             select 1 from booking_items bi
               join services s on s.id = bi.service_id
              where bi.booking_id = b.id
                and s.category in (${sql.join(WASH_CATEGORIES.map((c) => sql`${c}`), sql`, `)})
           )
         order by b.vehicle_id, coalesce(b.completed_at, b.scheduled_at) desc
      )
      select lw.user_id, lw.vehicle_id, lw.washed_at, v.wash_interval_days,
             (select count(*)::int from reward_stamps o
               where o.user_id = lw.user_id and o.voucher_id is null and o.voided_at is null and o.expires_at > ${now}) as on_card
        from last_wash lw
        join user_vehicles v on v.id = lw.vehicle_id and v.archived_at is null
       where lw.washed_at < ${new Date(now.getTime() - 4 * DAY_MS)}
         and not exists (
           select 1 from bookings b2 join payments p2 on p2.booking_id = b2.id
            where b2.vehicle_id = lw.vehicle_id
              and b2.status in ('pending', 'confirmed', 'in_progress')
              and p2.status in ('paid', 'collected')
         )
         and ${notRecentlyNudged(sql.raw('lw.user_id'))}
         and not exists (
           select 1 from reward_nudges n
            where n.user_id = lw.user_id and n.kind = 'wash_due'
              and n.subject_key = lw.vehicle_id || ':' || to_char(lw.washed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD')
         )
       order by lw.washed_at
       limit ${limit}
    `)

    return {
      vouchers: Array.from(vouchers).map((row) => ({ id: row.id, userId: row.user_id, amount: Number(row.amount), expiresAt: new Date(row.expires_at) })),
      cards: Array.from(cards).map((row) => ({ id: row.id, userId: row.user_id, expiresAt: new Date(row.expires_at) })),
      stamps: Array.from(stamps).map((row) => ({ userId: row.user_id, firstExpiry: new Date(row.first_expiry), count: Number(row.count) })),
      oneAway: Array.from(oneAway).map((row) => ({ userId: row.user_id, newestStampId: row.newest_id })),
      washDue: Array.from(washDue).map((row) => ({
        userId: row.user_id,
        vehicleId: row.vehicle_id,
        washedAt: new Date(row.washed_at),
        intervalDays: row.wash_interval_days,
        onCard: Number(row.on_card),
      })),
    }
  },

  /**
   * Claims a nudge: written only if the customer had none within the gap and
   * this subject was never nudged, under their lock, so overlapping runs send
   * it once and never two within the gap. A celebration (0054: a badge, a
   * challenge won, Wrapped) skips the gap and is left out of it, but is
   * still claimed once per subject.
   */
  async claimNudge(input: {
    userId: string
    kind: NudgeKind
    subjectKey: string
    title: string
    body: string
    linkUrl: string
    now: Date
    gapDays: number
  }): Promise<boolean> {
    return db.transaction(async (tx) => {
      await lockRewards(tx, input.userId)
      if (!isCelebratoryNudge(input.kind)) {
        const quietSince = new Date(input.now.getTime() - input.gapDays * DAY_MS)
        const [recent] = await tx
          .select({ id: rewardNudges.id })
          .from(rewardNudges)
          .where(and(eq(rewardNudges.userId, input.userId), gt(rewardNudges.sentAt, quietSince), countsTowardGap(rewardNudges.kind)))
          .limit(1)
        if (recent) return false
      }
      const rows = await tx
        .insert(rewardNudges)
        .values({
          userId: input.userId,
          kind: input.kind,
          subjectKey: input.subjectKey,
          title: input.title,
          body: input.body,
          linkUrl: input.linkUrl,
          sentAt: input.now,
        })
        .onConflictDoNothing()
        .returning({ id: rewardNudges.id })
      return rows.length > 0
    })
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  findCustomerByPhone(phone: string) {
    return db.query.users.findFirst({ where: eq(users.phone, phone), columns: { id: true, name: true, phone: true, createdAt: true, birthdayMonth: true, birthdayDay: true } })
  },

  findCustomerById(userId: string) {
    return db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true, phone: true, createdAt: true, birthdayMonth: true, birthdayDay: true } })
  },

  issuedInMonthPaise(monthKey: string) {
    return issuedInMonthPaise(db, monthKey)
  },

  async capReachedAt(monthKey: string) {
    const [row] = await db.select({ reachedAt: rewardCapMonths.reachedAt }).from(rewardCapMonths).where(eq(rewardCapMonths.month, monthKey)).limit(1)
    return row?.reachedAt ?? null
  },

  /** A month's figures for admin, all aggregates, by type. */
  async monthFigures(monthKey: string, now: Date) {
    const { start, end } = istMonthRange(monthKey)
    const until = end < now ? end : now
    const issued = await db.execute<{ kind: VoucherKind; n: number; total: string | null }>(sql`
      select kind, count(*)::int as n, sum(amount) as total
        from reward_vouchers
       where issued_at >= ${start} and issued_at < ${end}
       group by kind
    `)
    const redeemed = await db.execute<{ kind: VoucherKind; n: number; total: string | null }>(sql`
      select v.kind, count(*)::int as n, sum(dr.discount_amount) as total
        from discount_redemptions dr
        join reward_vouchers v on v.discount_id = dr.discount_id
        join bookings on bookings.id = dr.booking_id
        join payments on payments.booking_id = bookings.id
       where dr.created_at >= ${start} and dr.created_at < ${end}
         and ${DISCOUNT_HELD}
       group by v.kind
    `)
    const expired = await db.execute<{ kind: VoucherKind; n: number; total: string | null }>(sql`
      select v.kind, count(*)::int as n, sum(v.amount) as total
        from reward_vouchers v
       where v.cancelled_at is null
         and v.expires_at >= ${start} and v.expires_at < ${until}
         and ${heldBookingOf(sql.raw('v.discount_id'))} is null
       group by v.kind
    `)
    const outcomes = await db.execute<{ drawn_outcome: ScratchOutcome; outcome: ScratchOutcome; n: number; prizes: string | null; scratched: number }>(sql`
      select drawn_outcome, outcome, count(*)::int as n, sum(prize_amount) as prizes,
             count(*) filter (where scratched_at is not null)::int as scratched
        from reward_scratch_cards
       where created_at >= ${start} and created_at < ${end}
       group by drawn_outcome, outcome
    `)
    const stamps = await db.execute<{ source: string; n: number; used: number; lapsed: number; removed: number }>(sql`
      select source, count(*)::int as n,
             count(*) filter (where voucher_id is not null)::int as used,
             count(*) filter (where voucher_id is null and voided_at is null and expires_at <= ${now})::int as lapsed,
             count(*) filter (where voided_at is not null)::int as removed
        from reward_stamps
       where earned_at >= ${start} and earned_at < ${end}
       group by source
    `)
    const [stampsLapsed] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n
        from reward_stamps
       where voucher_id is null and voided_at is null
         and expires_at >= ${start} and expires_at < ${until}
    `)
    const [cardsExpired] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n
        from reward_scratch_cards
       where scratched_at is null and voided_at is null
         and expires_at >= ${start} and expires_at < ${until}
    `)
    const [judged] = await db.execute<{ earned: number; refused: number; revoked: number }>(sql`
      select count(*) filter (where earned)::int as earned,
             count(*) filter (where not earned)::int as refused,
             count(*) filter (where revoked_at is not null)::int as revoked
        from reward_bookings
       where judged_at >= ${start} and judged_at < ${end}
    `)
    const [drops] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from reward_level_drops where dropped_at >= ${start} and dropped_at < ${end}
    `)
    const byKind = <T extends { kind: VoucherKind; n: number; total: string | null }>(rows: Iterable<T>) =>
      Array.from(rows).map((row) => ({ kind: row.kind, n: Number(row.n), total: Number(row.total ?? 0).toFixed(2) }))
    return {
      issued: byKind(issued),
      redeemed: byKind(redeemed),
      expired: byKind(expired),
      outcomes: Array.from(outcomes).map((row) => ({
        drawn: row.drawn_outcome,
        outcome: row.outcome,
        n: Number(row.n),
        scratched: Number(row.scratched),
        prizes: row.prizes,
      })),
      stamps: Array.from(stamps).map((row) => ({
        source: row.source,
        n: Number(row.n),
        used: Number(row.used),
        lapsed: Number(row.lapsed),
        removed: Number(row.removed),
      })),
      stampsLapsed: Number(stampsLapsed?.n ?? 0),
      cardsExpired: Number(cardsExpired?.n ?? 0),
      judged: { earned: Number(judged?.earned ?? 0), refused: Number(judged?.refused ?? 0), revoked: Number(judged?.revoked ?? 0) },
      noShowDrops: Number(drops?.n ?? 0),
    }
  },

  /**
   * Every customer with a stamp-earning booking in the last 25 months: their
   * counts now and at `before` (the month's start), for the level
   * distribution and moves, and their months, for streaks.
   */
  async programmeFacts(now: Date, before: Date, settings: RewardsSettings) {
    const windowNow = monthsBefore(now, settings.levelWindowMonths)
    const windowBefore = monthsBefore(before, settings.levelWindowMonths)
    const dropsNow = monthsBefore(now, settings.noShowDropMonths)
    const dropsBefore = monthsBefore(before, settings.noShowDropMonths)
    const rows = await db.execute<{
      user_id: string
      now_n: number
      before_n: number
      now_drops: number
      before_drops: number
      months: string[] | null
    }>(sql`
      with earned as (
        select user_id, completed_at
          from reward_bookings
         where earned and revoked_at is null and completed_at > ${monthsBefore(now, 25)}
      ),
      people as (select distinct user_id from earned)
      select p.user_id,
             (select count(*)::int from earned e where e.user_id = p.user_id and e.completed_at > ${windowNow}) as now_n,
             (select count(*)::int from earned e where e.user_id = p.user_id and e.completed_at > ${windowBefore} and e.completed_at <= ${before}) as before_n,
             (select count(*)::int from reward_level_drops d where d.user_id = p.user_id and d.dropped_at > ${dropsNow}) as now_drops,
             (select count(*)::int from reward_level_drops d where d.user_id = p.user_id and d.dropped_at > ${dropsBefore} and d.dropped_at <= ${before}) as before_drops,
             (select array_agg(distinct to_char(e.completed_at at time zone 'Asia/Kolkata', 'YYYY-MM')) from earned e where e.user_id = p.user_id) as months
        from people p
       limit 20000
    `)
    return Array.from(rows).map((row) => ({
      userId: row.user_id,
      nowBookings: Number(row.now_n),
      beforeBookings: Number(row.before_n),
      nowDrops: Number(row.now_drops),
      beforeDrops: Number(row.before_drops),
      months: row.months ?? [],
    }))
  },

  /** Invites in a range: opened → taken up → first booking paid → rewarded. */
  async referralFunnel(start: Date, end: Date) {
    const [opens] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from reward_invite_opens where opened_at >= ${start} and opened_at < ${end}
    `)
    const [rest] = await db.execute<{ claimed: number; booked: number; rewarded: number; refused: number }>(sql`
      select count(*)::int as claimed,
             count(*) filter (where exists (
               select 1 from bookings b join payments p on p.booking_id = b.id
                where b.user_id = r.referee_id and p.status in ('paid', 'collected', 'refunded')
             ))::int as booked,
             count(*) filter (where r.status = 'rewarded')::int as rewarded,
             count(*) filter (where r.status = 'refused')::int as refused
        from reward_referrals r
       where r.claimed_at >= ${start} and r.claimed_at < ${end}
    `)
    return {
      opened: Number(opens?.n ?? 0),
      signedUp: Number(rest?.claimed ?? 0),
      firstBooking: Number(rest?.booked ?? 0),
      rewarded: Number(rest?.rewarded ?? 0),
      refused: Number(rest?.refused ?? 0),
    }
  },

  /** Customers with the most stamp-earning bookings in the level window. */
  async topCustomers(now: Date, settings: RewardsSettings, limit: number) {
    const rows = await db.execute<{ user_id: string; name: string; phone: string; earned: number; vouchers: number; saved: string | null }>(sql`
      select rb.user_id, u.name, u.phone, count(*)::int as earned,
             (select count(*)::int from reward_vouchers v where v.user_id = rb.user_id) as vouchers,
             (select sum(dr.discount_amount)
                from discount_redemptions dr
                join discounts d on d.id = dr.discount_id and d.source = 'reward'
                join bookings on bookings.id = dr.booking_id
                join payments on payments.booking_id = bookings.id
               where dr.user_id = rb.user_id and ${DISCOUNT_HELD}) as saved
        from reward_bookings rb
        join users u on u.id = rb.user_id
       where rb.earned and rb.revoked_at is null
         and rb.completed_at > ${monthsBefore(now, settings.levelWindowMonths)}
       group by rb.user_id, u.name, u.phone
       order by count(*) desc, rb.user_id
       limit ${limit}
    `)
    return Array.from(rows).map((row) => ({
      userId: row.user_id,
      name: row.name,
      phone: row.phone,
      earned: Number(row.earned),
      vouchers: Number(row.vouchers),
      saved: Number(row.saved ?? 0).toFixed(2),
    }))
  },

  /** Customers whose stamp-earning bookings in the last 12 months were mostly at least 80% off. */
  async heavyDiscountCounts(now: Date) {
    const rows = await db.execute<{ user_id: string; name: string; phone: string; earned: number; heavy: number }>(sql`
      select rb.user_id, u.name, u.phone, count(*)::int as earned,
             count(*) filter (where rb.discount_percent >= ${REWARDS_FIXED.heavyDiscountPercent})::int as heavy
        from reward_bookings rb
        join users u on u.id = rb.user_id
       where rb.earned and rb.revoked_at is null
         and rb.completed_at > ${monthsBefore(now, 12)}
       group by rb.user_id, u.name, u.phone
      having count(*) >= ${REWARDS_FIXED.heavyDiscountMinBookings}
         and count(*) filter (where rb.discount_percent >= ${REWARDS_FIXED.heavyDiscountPercent}) * 1.0 / count(*) > ${REWARDS_FIXED.heavyDiscountShare}
       order by count(*) filter (where rb.discount_percent >= ${REWARDS_FIXED.heavyDiscountPercent}) desc
       limit 50
    `)
    return Array.from(rows).map((row) => ({ userId: row.user_id, name: row.name, phone: row.phone, earned: Number(row.earned), heavy: Number(row.heavy) }))
  },

  /** One customer's heavy-discount counts (their admin view's flag). */
  async heavyDiscountCountsOf(userId: string, now: Date) {
    const [row] = await db
      .select({
        earned: sql<number>`count(*)::int`,
        heavy: sql<number>`count(*) filter (where ${rewardBookings.discountPercent} >= ${REWARDS_FIXED.heavyDiscountPercent})::int`,
      })
      .from(rewardBookings)
      .where(
        and(eq(rewardBookings.userId, userId), eq(rewardBookings.earned, true), isNull(rewardBookings.revokedAt), gt(rewardBookings.completedAt, monthsBefore(now, 12)))
      )
    return { earned: row?.earned ?? 0, heavy: row?.heavy ?? 0 }
  },

  /** The invites a customer sent, newest first (admin). */
  listReferralsBy(referrerId: string) {
    return db
      .select({
        id: rewardReferrals.id,
        status: rewardReferrals.status,
        refusal: rewardReferrals.refusal,
        claimedAt: rewardReferrals.claimedAt,
        settledAt: rewardReferrals.settledAt,
        refereeName: users.name,
        referrerRewarded: sql<boolean>`${rewardReferrals.referrerVoucherId} is not null`,
      })
      .from(rewardReferrals)
      .leftJoin(users, eq(users.id, rewardReferrals.refereeId))
      .where(eq(rewardReferrals.referrerId, referrerId))
      .orderBy(desc(rewardReferrals.claimedAt))
      .limit(30)
  },

  /** A customer's perks, newest first (admin). */
  listPerks(userId: string) {
    return db
      .select({ id: rewardPerks.id, kind: rewardPerks.kind, year: rewardPerks.year, level: rewardPerks.level, voucherId: rewardPerks.voucherId, createdAt: rewardPerks.createdAt })
      .from(rewardPerks)
      .where(eq(rewardPerks.userId, userId))
      .orderBy(desc(rewardPerks.createdAt))
      .limit(20)
  },

  /**
   * Every rewards event of an IST month, for the CSV export: stamps,
   * scratch cards, vouchers (issued, with their state), level drops and
   * invites, with the customer and the source booking. Bounded.
   */
  async ledger(monthKey: string) {
    const { start, end } = istMonthRange(monthKey)
    const rows = await db.execute<{
      at: Date | string
      type: string
      detail: string | null
      amount: string | null
      user_id: string
      name: string
      phone: string
      booking_id: string | null
      state: string | null
    }>(sql`
      select * from (
        select s.earned_at as at, 'stamp' as type, s.source as detail, null::numeric as amount, s.user_id,
               s.booking_id, case when s.voided_at is not null then 'removed' when s.voucher_id is not null then 'used' else 'on_card' end as state
          from reward_stamps s where s.earned_at >= ${start} and s.earned_at < ${end}
        union all
        select c.created_at, 'scratch_card', c.outcome || case when c.fell_back then ' (cap: was ' || c.drawn_outcome || ')' else '' end,
               c.prize_amount, c.user_id, c.root_booking_id,
               case when c.voided_at is not null then 'void' when c.scratched_at is not null then 'scratched' else 'waiting' end
          from reward_scratch_cards c where c.created_at >= ${start} and c.created_at < ${end}
        union all
        select v.issued_at, 'voucher', v.kind || coalesce(' · ' || v.level, ''), v.amount, v.user_id, v.source_booking_id,
               case when v.cancelled_at is not null then 'cancelled'
                    when ${heldBookingOf(sql.raw('v.discount_id'))} is not null then 'spent'
                    else 'unspent' end
          from reward_vouchers v where v.issued_at >= ${start} and v.issued_at < ${end}
        union all
        select d.dropped_at, 'level_drop', d.from_level || ' → ' || d.to_level, null, d.user_id, d.root_booking_id, null
          from reward_level_drops d where d.dropped_at >= ${start} and d.dropped_at < ${end}
        union all
        select r.claimed_at, 'invite', r.status, null, r.referrer_id, r.root_booking_id, r.refusal
          from reward_referrals r where r.claimed_at >= ${start} and r.claimed_at < ${end}
      ) events
      join users u on u.id = events.user_id
      order by events.at
      limit 20000
    `)
    return Array.from(rows).map((row) => ({
      at: new Date(row.at),
      type: row.type,
      detail: row.detail,
      amount: row.amount === null ? null : Number(row.amount).toFixed(2),
      userId: row.user_id,
      name: row.name,
      phone: row.phone,
      bookingId: row.booking_id,
      state: row.state,
    }))
  },

  /**
   * A team adjustment, under the customer's lock, with its audit row in the
   * same transaction: stamps on or off the card, a voucher, or cancelling
   * an unspent voucher.
   */
  async adjust(input: {
    userId: string
    action:
      | { kind: 'add_stamps'; stamps: number }
      | { kind: 'remove_stamps'; stamps: number }
      | { kind: 'issue_voucher'; amount: number }
      | { kind: 'cancel_voucher'; voucherId: string }
    reason: string
    actorName: string
    actorSub: string
    now: Date
    settings: RewardsSettings
  }) {
    const { now, settings } = input
    return db.transaction(async (tx) => {
      await lockRewards(tx, input.userId)
      const action = input.action
      let summary: Record<string, unknown> = { userId: input.userId, action: action.kind }
      const issued: IssuedVoucher[] = []

      if (action.kind === 'add_stamps' || action.kind === 'remove_stamps') {
        const onCard = stampsOnCard((await listStamps(tx, input.userId, now)) as StampRow[], now)
        const delta = action.kind === 'add_stamps' ? action.stamps : -action.stamps
        const refusal = stampAdjustmentRefusal(delta, onCard.length)
        if (refusal) return { kind: 'refused' as const, refusal }
        if (delta > 0) {
          await tx.insert(rewardStamps).values(
            Array.from({ length: delta }, () => ({
              userId: input.userId,
              source: 'adjustment' as const,
              earnedAt: now,
              expiresAt: stampExpiresAt(now, settings),
              reason: input.reason,
              actorName: input.actorName,
            }))
          )
          issued.push(...(await convertFullCards(tx, { userId: input.userId, now, settings })))
        } else {
          // The newest go first: a correction usually undoes the latest stamp.
          const newest = [...onCard].sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime()).slice(0, -delta)
          await tx
            .update(rewardStamps)
            .set({ voidedAt: now, voidReason: `Removed by ${input.actorName}: ${input.reason}`.slice(0, 300) })
            .where(and(inArray(rewardStamps.id, newest.map((s) => s.id)), isNull(rewardStamps.voucherId), isNull(rewardStamps.voidedAt)))
        }
        summary = { ...summary, stamps: delta, onCardBefore: onCard.length }
      } else if (action.kind === 'issue_voucher') {
        if (!Number.isInteger(action.amount) || action.amount < 1 || action.amount > REWARDS_FIXED.maxAdjustmentVoucher) {
          return { kind: 'refused' as const, refusal: 'voucher_amount' as const }
        }
        const voucher = await issueVoucher(tx, {
          userId: input.userId,
          kind: 'adjustment',
          amount: action.amount,
          now,
          settings,
          reason: input.reason,
          actorName: input.actorName,
        })
        issued.push({ id: voucher.id, kind: voucher.kind, amount: voucher.amount, userId: input.userId })
        summary = { ...summary, voucherId: voucher.id, amount: voucher.amount }
      } else {
        const [voucher] = await tx
          .select({ id: rewardVouchers.id, discountId: rewardVouchers.discountId, cancelledAt: rewardVouchers.cancelledAt, amount: rewardVouchers.amount })
          .from(rewardVouchers)
          .where(and(eq(rewardVouchers.id, action.voucherId), eq(rewardVouchers.userId, input.userId)))
          .limit(1)
        if (!voucher) return { kind: 'refused' as const, refusal: 'voucher_not_found' as const }
        if (voucher.cancelledAt) return { kind: 'refused' as const, refusal: 'voucher_cancelled' as const }
        const [held] = await tx.execute<{ booking_id: string | null }>(sql`select ${heldBookingOf(sql`${voucher.discountId}::uuid`)} as booking_id`)
        if (held?.booking_id) return { kind: 'refused' as const, refusal: 'voucher_spent' as const }
        await tx
          .update(rewardVouchers)
          .set({ cancelledAt: now, cancelledBy: input.actorName, cancelReason: input.reason })
          .where(and(eq(rewardVouchers.id, voucher.id), isNull(rewardVouchers.cancelledAt)))
        await tx.update(discounts).set({ isActive: false }).where(eq(discounts.id, voucher.discountId))
        summary = { ...summary, voucherId: voucher.id, amount: voucher.amount }
      }

      await tx.insert(adminAuditLog).values({
        action: action.kind === 'cancel_voucher' ? 'reward_voucher_cancelled' : 'reward_adjusted',
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary,
        detail: { reason: input.reason },
      })
      const capAlert = issued.length > 0 ? await capCheck(tx, { now, settings, forced: false }) : null
      return { kind: 'ok' as const, issued, capAlert }
    })
  },
}
