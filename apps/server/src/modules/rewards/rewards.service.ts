import { runInBackground } from '../../lib/background.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import { firstNameOf } from '../../lib/home-updates.js'
import { istDateKey, MONTHS } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { customerRewardNudge, customerRewardVoucher } from '../../lib/push-messages.js'
import {
  addMonthsToMonthKey,
  birthdayProblem,
  DEFAULT_REWARDS_SETTINGS,
  drawScratchOutcome,
  expiringNudge,
  heavyDiscountFlag,
  inviteToken,
  isNudgeRun,
  istMonthKey,
  istMonthRange,
  lastValidDay,
  LEVELS,
  levelFor,
  levelLabel,
  levelMoves,
  levelProgress,
  levelSettings,
  newReferralCode,
  normalizeReferralCode,
  NUDGE_PRIORITY,
  oneAwayNudge,
  perkDue,
  phoneHash,
  planNudges,
  readInviteToken,
  referralClaimRefusal,
  REWARDS_FIXED,
  rupees,
  SCRATCH_OUTCOMES,
  scratchPrizeLabel,
  SETTINGS_LIMITS,
  settingsProblems,
  STAMP_LABELS,
  stampRefusalLabel,
  stampsOnCard,
  streakLength,
  streakView,
  VOUCHER_KINDS,
  VOUCHER_LABELS,
  voucherState,
  washDueNudge,
  type NudgeCandidate,
  type PerkKind,
  type RewardLevel,
  type RewardsSettings,
  type ScratchOutcome,
  type StampRow,
} from '../../lib/rewards.js'
import { isWashDue, washStatus } from '../../lib/wash-status.js'
import { pushService } from '../push/push.service.js'
import { rewardsRepository, type IssuedVoucher, type JudgeResult } from './rewards.repository.js'
import { currentSettings, forgetSettings, rewardsLive } from './rewards.settings.js'
import type { AdjustRewardsInput, SaveSettingsInput } from './rewards.validation.js'

const log = logger.child({ module: 'rewards' })

const DAY_MS = 24 * 60 * 60 * 1000
/** The cron's catch-up looks back this far for completions and no-shows nothing judged yet. */
const CATCH_UP_LOOKBACK_MS = 2 * DAY_MS
const CATCH_UP_BATCH = 30
const REVOKE_BATCH = 30
const NUDGE_BATCH = 50
const PERK_BATCH = 30
const SWEEP_BUDGET_MS = 15_000

/** "••••••1234": enough for the team to match a caller, in lists. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : '••••'
}

/** "Oct 2026" */
function monthYear(at: Date): string {
  const key = istDateKey(at)
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

type Stamp = Awaited<ReturnType<typeof rewardsRepository.listStamps>>[number]

function stampView(stamp: Stamp, now: Date) {
  return {
    id: stamp.id,
    source: stamp.source,
    label: STAMP_LABELS[stamp.source],
    earnedAt: stamp.earnedAt.toISOString(),
    expiresAt: stamp.expiresAt.toISOString(),
    lastDay: lastValidDay(stamp.expiresAt),
    bookingId: stamp.bookingId,
    state: stamp.voidedAt ? 'removed' : stamp.voucherId ? 'used' : stamp.expiresAt <= now ? 'expired' : 'on_card',
  }
}

type VoucherRow = Awaited<ReturnType<typeof rewardsRepository.listVouchers>>[number]

function voucherView(voucher: VoucherRow, now: Date, settings: RewardsSettings, options: { admin: boolean }) {
  const state = voucherState(voucher, voucher.heldBookingId, now)
  return {
    id: voucher.id,
    kind: voucher.kind,
    label:
      voucher.kind === 'shine' && voucher.level
        ? `${VOUCHER_LABELS.shine} (${levelLabel(settings, voucher.level)})`
        : VOUCHER_LABELS[voucher.kind],
    amount: voucher.amount,
    // The code is what checkout takes; the customer sees it while they can use it.
    code: options.admin || state === 'available' ? voucher.code : null,
    issuedAt: voucher.issuedAt.toISOString(),
    expiresAt: voucher.expiresAt.toISOString(),
    lastDay: lastValidDay(voucher.expiresAt),
    state,
    bookingId: voucher.heldBookingId,
    sourceBookingId: voucher.sourceBookingId,
    ...(options.admin && { reason: voucher.reason, actorName: voucher.actorName }),
  }
}

type CardRow = Awaited<ReturnType<typeof rewardsRepository.listScratchCards>>[number]

function cardView(card: CardRow, now: Date) {
  const state = card.voidedAt
    ? ('void' as const)
    : card.scratchedAt
      ? ('scratched' as const)
      : card.expiresAt <= now
        ? ('expired' as const)
        : ('waiting' as const)
  return {
    id: card.id,
    rootBookingId: card.rootBookingId,
    bookingId: card.bookingId ?? card.rootBookingId,
    vendorName: card.vendorName,
    createdAt: card.createdAt.toISOString(),
    expiresAt: card.expiresAt.toISOString(),
    lastDay: lastValidDay(card.expiresAt),
    state,
    // Never before it is scratched: the app learns the prize only by scratching.
    prize:
      state === 'scratched'
        ? { outcome: card.outcome, label: scratchPrizeLabel(card.outcome, card.prizeAmount), amount: card.prizeAmount, fellBack: card.fellBack }
        : null,
  }
}

/** The ladder: every level, what reaching it takes, and what it unlocks. */
function ladder(settings: RewardsSettings, current: RewardLevel) {
  const reached = LEVELS.indexOf(current)
  return settings.levels.map((row, i) => {
    const unlocks = [`₹${row.cardReward} off for a full Shine Card`]
    if (row.birthdayVoucher !== null) unlocks.push(`A birthday wash, up to ₹${row.birthdayVoucher}`)
    if (row.scratchWeights) unlocks.push('Better scratch card odds')
    if (row.annualDetailingVoucher !== null) unlocks.push(`One detailing a year, up to ₹${row.annualDetailingVoucher}`)
    if (row.garageBadge) unlocks.push(`Garages see your ${row.label} badge`)
    return { key: row.key, label: row.label, minBookings: row.minBookings, unlocks, reached: i <= reached, current: row.key === current }
  })
}

/** The Shine Card and level: what Home and the Rewards page both show. */
async function cardAndLevel(userId: string, now: Date, settings: RewardsSettings) {
  const stamps = await rewardsRepository.listStamps(userId, now)
  const onCard = stampsOnCard(stamps as Array<Stamp & StampRow>, now)
  const facts = await rewardsRepository.levelFacts(userId, now, settings)
  const progress = levelProgress(facts.completedAt, facts.drops, now, settings)
  const reward = levelSettings(settings, progress.level).cardReward
  const first = onCard[0]
  const soon = first ? onCard.filter((stamp) => lastValidDay(stamp.expiresAt) === lastValidDay(first.expiresAt)).length : 0
  return {
    stamps,
    card: {
      onCard: onCard.length,
      goal: settings.stampsPerCard,
      toGo: settings.stampsPerCard - onCard.length,
      rewardAmount: reward,
      stamps: onCard.map((stamp) => stampView(stamp, now)),
      nextExpiry: first ? { count: soon, lastDay: lastValidDay(first.expiresAt) } : null,
    },
    level: {
      ...progress,
      label: levelLabel(settings, progress.level),
      nextLabel: progress.next ? levelLabel(settings, progress.next) : null,
    },
  }
}

/** After a rewards write commits: phones hear about new vouchers, ops about the cap. */
function announce(vouchers: IssuedVoucher[], capAlert: { month: string; issuedPaise: number } | null, settings: RewardsSettings) {
  for (const voucher of vouchers) {
    // A scratch prize is news the customer just saw on screen.
    if (voucher.kind === 'scratch' || voucher.kind === 'free_wash') continue
    pushService.notifyCustomer(voucher.userId, customerRewardVoucher(voucher))
  }
  if (capAlert) {
    log.warn({ month: capAlert.month, issued: rupees(capAlert.issuedPaise) }, 'rewards:cap_reached')
    alertOps({
      kind: 'rewards_cap_reached',
      month: capAlert.month,
      cap: rupees(settings.monthlyCap * 100),
      issued: rupees(capAlert.issuedPaise),
    })
  }
}

const CLAIM_REFUSALS = {
  own_code: { status: 409, message: "That's your own invite. Share it with a friend instead.", code: 'INVITE_OWN_CODE' },
  already_referred: { status: 409, message: "You've already joined through an invite.", code: 'INVITE_ALREADY_USED' },
  phone_seen: { status: 409, message: 'Invites are for people new to Detlio.', code: 'INVITE_NOT_NEW' },
  not_new: { status: 409, message: 'Invites are for people new to Detlio.', code: 'INVITE_NOT_NEW' },
  has_bookings: { status: 409, message: 'Invites are for people new to Detlio.', code: 'INVITE_NOT_NEW' },
} as const

/** What the app may know of the settings: everything but the budget. */
function publicSettings(settings: RewardsSettings) {
  const { monthlyCap: _cap, ...rest } = settings
  return rest
}

export const rewardsService = {
  /** Whether the app shows rewards, and the live numbers it shows. Always answers. */
  async config() {
    if (!(await rewardsLive())) return { enabled: false as const, settings: null }
    return { enabled: true as const, settings: publicSettings((await currentSettings()).settings) }
  },

  // ─── Settings (admin) ─────────────────────────────────────────────────────

  /** The settings in force, who saved them, the master switch, the limits and the defaults. */
  async adminSettings() {
    const current = await currentSettings(0)
    const versions = await rewardsRepository.listSettingsVersions(10)
    return {
      masterSwitch: env.rewardsEnabled,
      live: env.rewardsEnabled && current.settings.enabled,
      version: current.version,
      settings: current.settings,
      savedBy: current.actorName,
      savedAt: current.savedAt?.toISOString() ?? null,
      versions: versions.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      limits: SETTINGS_LIMITS,
      defaults: DEFAULT_REWARDS_SETTINGS,
    }
  },

  /**
   * Saves new settings: every rule checked (400 with the list), only on top
   * of the version the admin opened (409), audit-logged with before → after.
   * Applies going forward: anything already issued keeps its values.
   */
  async saveSettings(input: SaveSettingsInput & { actorSub: string }, now = new Date()) {
    const settings = input.settings as RewardsSettings
    const problems = settingsProblems(settings)
    if (problems.length > 0) {
      // Every problem at once, so the form can be fixed in one go.
      throw new AppError(400, problems.join(' · '), 'REWARD_SETTINGS_INVALID')
    }
    const result = await rewardsRepository.saveSettings({
      expectedVersion: input.version,
      settings,
      actorName: input.actorName,
      actorSub: input.actorSub,
      now,
    })
    if (result.kind === 'stale') {
      throw new AppError(409, 'Someone saved the settings since you opened them. Reload and try again.', 'REWARD_SETTINGS_CHANGED')
    }
    forgetSettings()
    if (result.kind === 'saved') log.info({ version: result.version, actorName: input.actorName }, 'rewards:settings_saved')
    return rewardsService.adminSettings()
  },

  // ─── Earning ──────────────────────────────────────────────────────────────

  /**
   * A booking completed (Mark completed, Delivered, Detlio's Delivered):
   * judges its chain once — a stamp and a scratch card, or why not. Nothing
   * at all while rewards are not live.
   */
  async onBookingCompleted(
    bookingId: string,
    now = new Date(),
    draw?: (level: RewardLevel, settings: RewardsSettings) => { outcome: ScratchOutcome; amount: number | null }
  ): Promise<JudgeResult | null> {
    if (!(await rewardsLive())) return null
    const { settings } = await currentSettings()
    const result = await rewardsRepository.judgeCompletion({
      bookingId,
      now,
      settings,
      draw: (level) => (draw ? draw(level, settings) : drawScratchOutcome(level, settings)),
    })
    if (result.kind === 'earned') {
      log.info(
        {
          bookingId,
          userId: result.userId,
          prize: result.prize.outcome,
          fellBack: result.prize.fellBack,
          streakBonus: result.streakBonus,
          vouchers: result.vouchers.length,
          referral: result.referral,
        },
        'rewards:stamp_earned'
      )
      announce(result.vouchers, result.capAlert, settings)
    } else if (result.kind === 'refused') {
      log.info({ bookingId, userId: result.userId, refusal: result.refusal }, 'rewards:no_stamp')
    }
    return result
  },

  /** After a completion's response: never slows or fails it. The cron catches up anything missed. */
  scheduleAfterCompletion(bookingId: string): void {
    if (!env.rewardsEnabled) return
    runInBackground('rewards_judge', () => rewardsService.onBookingCompleted(bookingId))
  },

  /** A customer no-show recorded: one level off (once per chain). */
  async onCustomerNoShow(bookingId: string, now = new Date()) {
    if (!(await rewardsLive())) return null
    const { settings } = await currentSettings()
    const result = await rewardsRepository.recordNoShow(bookingId, now, settings)
    if (result) log.info({ bookingId, ...result }, 'rewards:level_dropped')
    return result
  },

  scheduleAfterNoShow(bookingId: string): void {
    if (!env.rewardsEnabled) return
    runInBackground('rewards_no_show', () => rewardsService.onCustomerNoShow(bookingId))
  },

  // ─── The customer ─────────────────────────────────────────────────────────

  /** Home's strip: the Shine Card, the level, scratch cards waiting and vouchers to use. */
  async summary(userId: string, now = new Date()) {
    const { settings } = await currentSettings()
    const { card, level } = await cardAndLevel(userId, now, settings)
    const cards = (await rewardsRepository.listScratchCards(userId, now)).map((row) => cardView(row, now))
    const vouchers = (await rewardsRepository.listVouchers(userId, now)).map((row) => voucherView(row, now, settings, { admin: false }))
    const waiting = cards.filter((c) => c.state === 'waiting')
    const available = vouchers.filter((v) => v.state === 'available').sort((a, b) => Number(b.amount) - Number(a.amount))
    return {
      card,
      level,
      scratchWaiting: waiting.length,
      scratchCards: waiting,
      vouchersAvailable: available.length,
      vouchers: available,
    }
  },

  /** The Rewards page: everything the customer has, what is next, and the lifetime line. */
  async myRewards(userId: string, now = new Date()) {
    const { settings } = await currentSettings()
    const { card, level } = await cardAndLevel(userId, now, settings)
    const streak = streakView(await rewardsRepository.earnedMonths(userId, now), now, settings)
    const vouchers = (await rewardsRepository.listVouchers(userId, now)).map((row) => voucherView(row, now, settings, { admin: false }))
    const cards = (await rewardsRepository.listScratchCards(userId, now)).map((row) => cardView(row, now))
    const judged = await rewardsRepository.listJudged(userId, 20)
    const drops = await rewardsRepository.listLevelDrops(userId, 5)
    const code = await rewardsRepository.findReferralCode(userId)
    const invites = code ? await rewardsRepository.referralCounts(userId, now) : { rewardedThisYear: 0, pending: 0, total: 0 }
    const referredBy = await rewardsRepository.findReferralOf(userId)
    const lifetime = await rewardsRepository.lifetime(userId)
    const birthday = await rewardsRepository.findBirthday(userId)

    const history = [
      ...judged.map((row) => ({
        id: `booking:${row.rootBookingId}`,
        at: row.completedAt.toISOString(),
        title: !row.earned ? 'No stamp' : row.revokedAt ? 'Stamp taken back' : 'Stamp earned',
        detail: [
          row.vendorName,
          !row.earned && row.refusal ? stampRefusalLabel(row.refusal, settings) : null,
          row.revokeReason === 'test' ? 'Test booking' : row.revokeReason === 'refunded' ? 'Refunded' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        bookingId: row.bookingId as string | null,
      })),
      ...drops.map((row) => ({
        id: `drop:${row.id}`,
        at: row.droppedAt.toISOString(),
        title:
          row.fromLevel === row.toLevel
            ? 'Missed booking'
            : `Level down: ${levelLabel(settings, row.fromLevel)} to ${levelLabel(settings, row.toLevel)}`,
        detail: 'A booking you did not turn up for',
        bookingId: null as string | null,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at))

    return {
      card,
      level,
      ladder: ladder(settings, level.level),
      streak: { ...streak, monthsNeeded: settings.streakMonths, bonusStamps: settings.streakBonusStamps },
      lifetime: {
        saved: lifetime.saved,
        washes: lifetime.washes,
        since: lifetime.since ? monthYear(lifetime.since) : null,
      },
      vouchers,
      scratchCards: cards,
      history,
      birthday,
      invite: {
        code,
        amount: settings.referralAmount,
        minAmount: settings.minPaidAmount,
        rewardedThisYear: invites.rewardedThisYear,
        maxPerYear: settings.referralMaxPerYear,
        pending: invites.pending,
      },
      referredBy: referredBy ? { firstName: firstNameOf(referredBy.referrerName), status: referredBy.status } : null,
    }
  },

  async scratch(userId: string, cardId: string, now = new Date()) {
    const { settings } = await currentSettings()
    const result = await rewardsRepository.scratch({ userId, cardId, now, settings })
    switch (result.kind) {
      case 'not_found':
        throw new AppError(404, 'Scratch card not found', 'SCRATCH_CARD_NOT_FOUND')
      case 'expired':
        throw new AppError(409, 'This scratch card has run out.', 'SCRATCH_CARD_EXPIRED')
      case 'void':
        throw new AppError(409, "This scratch card's booking was refunded, so the card was withdrawn.", 'SCRATCH_CARD_VOID')
      case 'revealed':
        if (!result.already) {
          log.info({ userId, cardId, outcome: result.outcome }, 'rewards:scratched')
          announce(result.vouchers, result.capAlert, settings)
        }
        return {
          outcome: result.outcome,
          label: scratchPrizeLabel(result.outcome, result.prizeAmount),
          amount: result.prizeAmount,
          fellBack: result.fellBack,
          voucher: result.voucher
            ? { id: result.voucher.id, code: result.voucher.code, amount: result.voucher.amount, lastDay: lastValidDay(result.voucher.expiresAt) }
            : null,
          // A bonus stamp may have filled the card.
          shineVoucher: result.vouchers.find((v) => v.kind === 'shine') ?? null,
        }
    }
  },

  /** The customer's birthday (month and day), for the birthday perk; null removes it. */
  async setBirthday(userId: string, birthday: { month: number; day: number } | null) {
    if (birthday) {
      const problem = birthdayProblem(birthday.month, birthday.day)
      if (problem) throw new AppError(400, problem, 'BIRTHDAY_INVALID')
    }
    await rewardsRepository.setBirthday(userId, birthday)
    return { birthday }
  },

  /** The customer's invite code, made the first time they ask. */
  async createInvite(userId: string) {
    const { settings } = await currentSettings()
    const code = await rewardsRepository.ensureReferralCode(userId, () => newReferralCode())
    return { code, amount: settings.referralAmount }
  },

  /**
   * The invite page: who invited (first name only) and a signed note of
   * when it was opened, which the new account brings back to claim it.
   * Each open is counted (inviter and time only) for the admin's funnel.
   */
  async openInvite(rawCode: string, now = new Date()) {
    const code = normalizeReferralCode(rawCode)
    const referrer = code ? await rewardsRepository.findReferrerByCode(code) : undefined
    if (!code || !referrer) throw new AppError(404, "This invite link isn't valid.", 'INVITE_NOT_FOUND')
    const { settings } = await currentSettings()
    await rewardsRepository.recordInviteOpen(referrer.userId, now)
    return {
      referrerFirstName: firstNameOf(referrer.name),
      amount: settings.referralAmount,
      minAmount: settings.minPaidAmount,
      token: inviteToken(code, now, env.jwtSecret),
    }
  },

  /** A new customer takes up the invite they opened before signing up. */
  async claimInvite(userId: string, token: string, now = new Date()) {
    const invite = readInviteToken(token, env.jwtSecret, now)
    if (!invite) throw new AppError(400, 'This invite has run out. Ask your friend for a new link.', 'INVITE_INVALID')
    const referrer = await rewardsRepository.findReferrerByCode(invite.code)
    if (!referrer) throw new AppError(400, 'This invite has run out. Ask your friend for a new link.', 'INVITE_INVALID')
    const me = await rewardsRepository.findUserPhone(userId)
    if (!me) throw new AppError(404, 'User not found', 'USER_NOT_FOUND')
    const hash = phoneHash(me.phone, env.jwtSecret)
    const facts = await rewardsRepository.claimFacts(userId, hash)
    const refusal = referralClaimRefusal({
      referrerId: referrer.userId,
      refereeId: userId,
      accountCreatedAt: me.createdAt,
      inviteOpenedAt: invite.openedAt,
      ...facts,
    })
    if (refusal) {
      const r = CLAIM_REFUSALS[refusal]
      throw new AppError(r.status, r.message, r.code)
    }
    const inserted = await rewardsRepository.insertReferral({ referrerId: referrer.userId, refereeId: userId, phoneHash: hash, openedAt: invite.openedAt, now })
    if (!inserted) throw new AppError(409, CLAIM_REFUSALS.already_referred.message, CLAIM_REFUSALS.already_referred.code)
    log.info({ userId, referrerId: referrer.userId }, 'rewards:invite_claimed')
    const { settings } = await currentSettings()
    return { referrerFirstName: firstNameOf(referrer.name), amount: settings.referralAmount, minAmount: settings.minPaidAmount }
  },

  /** Rewards news for Updates (cards, vouchers, nudges), only while live. */
  async hubEvents(userId: string, since: Date) {
    if (!(await rewardsLive())) return null
    return rewardsRepository.listHubEvents(userId, since)
  },

  /**
   * The level names garages see on job cards (levels with the garage badge
   * on), by customer: the name only, nothing else. Empty while not live.
   */
  async garageBadges(userIds: string[], now = new Date()): Promise<Map<string, string>> {
    const badges = new Map<string, string>()
    if (userIds.length === 0 || !(await rewardsLive())) return badges
    const { settings } = await currentSettings()
    if (!settings.levels.some((row) => row.garageBadge)) return badges
    const facts = await rewardsRepository.levelFactsMany([...new Set(userIds)], now, settings)
    for (const [userId, f] of facts) {
      const row = levelSettings(settings, levelFor(f.bookings, f.drops, settings))
      if (row.garageBadge) badges.set(userId, row.label)
    }
    return badges
  },

  // ─── The cron ─────────────────────────────────────────────────────────────

  /**
   * The pending-digest cron's part, only while live: judges completions and
   * records no-shows the after-response hooks missed (last 2 days), takes
   * back stamps of bookings since marked Test or refunded, then, in the
   * 10:00–17:59 IST runs, level perks and the habit nudges. Bounded
   * batches, 15-second budget.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    if (!(await rewardsLive())) return { enabled: false as const }
    const { settings } = await currentSettings()
    const started = Date.now()
    const outOfTime = () => Date.now() - started > SWEEP_BUDGET_MS
    const summary = { enabled: true as const, judged: 0, noShows: 0, revoked: 0, perks: 0, nudges: 0, failed: 0, outOfTime: false }
    const since = new Date(now.getTime() - CATCH_UP_LOOKBACK_MS)

    if (!options.dryRun) {
      for (const bookingId of await rewardsRepository.listUnjudgedCompletions(since, CATCH_UP_BATCH)) {
        if (outOfTime()) return { ...summary, outOfTime: true }
        try {
          const result = await rewardsService.onBookingCompleted(bookingId, now)
          if (result && (result.kind === 'earned' || result.kind === 'refused')) summary.judged += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, bookingId }, 'rewards:catch_up_failed')
        }
      }
      for (const bookingId of await rewardsRepository.listUnrecordedNoShows(since, CATCH_UP_BATCH)) {
        if (outOfTime()) return { ...summary, outOfTime: true }
        try {
          if (await rewardsService.onCustomerNoShow(bookingId, now)) summary.noShows += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, bookingId }, 'rewards:no_show_catch_up_failed')
        }
      }
      for (const row of await rewardsRepository.listToRevoke(REVOKE_BATCH)) {
        if (outOfTime()) return { ...summary, outOfTime: true }
        try {
          const revoked = await rewardsRepository.revoke({ ...row, now })
          if (revoked) {
            summary.revoked += 1
            log.info({ ...row, ...revoked }, 'rewards:stamp_revoked')
          }
        } catch (err) {
          summary.failed += 1
          log.error({ err, rootBookingId: row.rootBookingId }, 'rewards:revoke_failed')
        }
      }
    }

    if (!isNudgeRun(now)) return summary

    // Level perks: a birthday voucher in the birthday month, an annual
    // detailing voucher, each once per IST calendar year.
    for (const kind of ['birthday', 'annual_detailing'] as PerkKind[]) {
      const giving = settings.levels.filter((row) => (kind === 'birthday' ? row.birthdayVoucher : row.annualDetailingVoucher) !== null)
      if (giving.length === 0) continue
      const minBookings = Math.min(...giving.map((row) => row.minBookings))
      const candidates = await rewardsRepository.perkCandidates({ kind, minBookings, now, settings, limit: PERK_BATCH })
      if (options.dryRun) {
        summary.perks += candidates.length
        continue
      }
      for (const userId of candidates) {
        if (outOfTime()) return { ...summary, outOfTime: true }
        try {
          const granted = await rewardsRepository.grantPerk({
            userId,
            kind,
            now,
            settings,
            amountFor: (facts) => perkDue(kind, { ...facts, now }, settings),
          })
          if (granted) {
            summary.perks += 1
            log.info({ userId, kind, level: granted.level }, 'rewards:perk_granted')
            announce([granted.voucher], granted.capAlert, settings)
          }
        } catch (err) {
          summary.failed += 1
          log.error({ err, userId, kind }, 'rewards:perk_failed')
        }
      }
    }

    const plan = planNudges(await rewardsService.nudgeCandidates(now, settings))
    if (options.dryRun) return { ...summary, nudges: plan.length }
    for (const nudge of plan) {
      if (outOfTime()) return { ...summary, outOfTime: true }
      try {
        const claimed = await rewardsRepository.claimNudge({
          userId: nudge.userId,
          kind: nudge.kind,
          subjectKey: nudge.subjectKey,
          title: nudge.words.title,
          body: nudge.words.body,
          linkUrl: nudge.words.url,
          now,
          gapDays: settings.nudgeGapDays,
        })
        if (!claimed) continue
        summary.nudges += 1
        // Only to customers with Reminders on and a device (push applies the switch).
        await pushService.sendNow({ audience: 'customer', userId: nudge.userId }, customerRewardNudge(nudge))
      } catch (err) {
        summary.failed += 1
        log.error({ err, userId: nudge.userId, kind: nudge.kind }, 'rewards:nudge_failed')
      }
    }
    if (summary.nudges > 0) log.info({ nudges: summary.nudges }, 'rewards:nudged')
    return summary
  },

  /** Every nudge that could go now, before one is picked per customer. */
  async nudgeCandidates(now: Date, settings: RewardsSettings): Promise<NudgeCandidate[]> {
    const found = await rewardsRepository.nudgeCandidates(now, NUDGE_BATCH, settings)
    const candidates: NudgeCandidate[] = []
    for (const voucher of found.vouchers) {
      candidates.push({
        userId: voucher.userId,
        kind: 'expiring',
        subjectKey: `voucher:${voucher.id}`,
        words: expiringNudge('voucher', { amount: Math.round(voucher.amount), lastDay: lastValidDay(voucher.expiresAt) }),
        priority: NUDGE_PRIORITY.voucher,
      })
    }
    for (const card of found.cards) {
      candidates.push({
        userId: card.userId,
        kind: 'expiring',
        subjectKey: `card:${card.id}`,
        words: expiringNudge('scratch_card', { lastDay: lastValidDay(card.expiresAt) }),
        priority: NUDGE_PRIORITY.scratch_card,
      })
    }
    for (const row of found.stamps) {
      const lastDay = lastValidDay(row.firstExpiry)
      candidates.push({
        userId: row.userId,
        kind: 'expiring',
        subjectKey: `stamps:${lastDay}`,
        words: expiringNudge('stamps', { count: row.count, lastDay }),
        priority: NUDGE_PRIORITY.stamps,
      })
    }
    for (const row of found.oneAway) {
      const facts = await rewardsRepository.levelFacts(row.userId, now, settings)
      const level = levelFor(facts.completedAt.length, facts.drops, settings)
      candidates.push({
        userId: row.userId,
        kind: 'one_away',
        subjectKey: `stamp:${row.newestStampId}`,
        words: oneAwayNudge(levelSettings(settings, level).cardReward),
        priority: NUDGE_PRIORITY.one_away,
      })
    }
    for (const car of found.washDue) {
      // The wash bar's own rule (lib/wash-status.ts), on the car's interval.
      const status = washStatus({ intervalDays: car.intervalDays, lastWashAt: car.washedAt, bookedFor: null, now })
      if (!isWashDue(status)) continue
      candidates.push({
        userId: car.userId,
        kind: 'wash_due',
        // One nudge per wash: the car and the IST date of its last wash.
        subjectKey: `${car.vehicleId}:${istDateKey(car.washedAt)}`,
        words: washDueNudge(car.onCard, settings),
        priority: NUDGE_PRIORITY.wash_due,
      })
    }
    return candidates
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  /**
   * Admin → Rewards for an IST month (default this one): issued, redeemed
   * and lapsed by type, spend against the cap, scratch outcomes, stamps by
   * source, the level distribution and moves since the month began,
   * streaks, the invite funnel, top customers and the abuse flags.
   */
  async adminSummary(monthKey: string | undefined, now = new Date()) {
    const { settings } = await currentSettings()
    const month = monthKey ?? istMonthKey(now)
    const { start, end } = istMonthRange(month)
    const asOf = end < now ? new Date(end.getTime() - 1) : now
    const issued = await rewardsRepository.issuedInMonthPaise(month)
    const figures = await rewardsRepository.monthFigures(month, now)
    const capReachedAt = await rewardsRepository.capReachedAt(month)
    const people = await rewardsRepository.programmeFacts(asOf, start, settings)
    const funnel = await rewardsRepository.referralFunnel(start, end)
    const funnelAll = await rewardsRepository.referralFunnel(new Date(0), now)
    const top = await rewardsRepository.topCustomers(asOf, settings, 15)
    const flagged = await rewardsRepository.heavyDiscountCounts(now)

    const moves = levelMoves(
      people.map((p) => ({
        now: levelFor(p.nowBookings, p.nowDrops, settings),
        before: levelFor(p.beforeBookings, p.beforeDrops, settings),
      }))
    )
    const thisMonth = istMonthKey(asOf)
    const lastMonth = addMonthsToMonthKey(thisMonth, -1)
    const streaks = { active: 0, oneMonth: 0, twoPlus: 0, bonusesThisMonth: 0 }
    for (const p of people) {
      const length = Math.max(streakLength(p.months, thisMonth), streakLength(p.months, lastMonth))
      if (length >= 1) streaks.active += 1
      if (length === 1) streaks.oneMonth += 1
      if (length >= 2) streaks.twoPlus += 1
    }
    streaks.bonusesThisMonth = figures.stamps.find((row) => row.source === 'streak')?.n ?? 0

    const kindRow = (rows: Array<{ kind: string; n: number; total: string }>) =>
      VOUCHER_KINDS.map((kind) => {
        const row = rows.find((r) => r.kind === kind)
        return { kind, label: VOUCHER_LABELS[kind], count: row?.n ?? 0, amount: row?.total ?? '0.00' }
      })
    const prizes = figures.outcomes.reduce((sum, row) => sum + Number(row.prizes ?? 0), 0)
    const levelFigure = (level: RewardLevel) => levelLabel(settings, level)

    return {
      month,
      live: env.rewardsEnabled && settings.enabled,
      masterSwitch: env.rewardsEnabled,
      cap: rupees(settings.monthlyCap * 100),
      issued: rupees(issued),
      capReachedAt: capReachedAt?.toISOString() ?? null,
      scratchPrizesCounted: prizes.toFixed(2),
      vouchers: { issued: kindRow(figures.issued), redeemed: kindRow(figures.redeemed), expired: kindRow(figures.expired) },
      stamps: {
        bySource: ['booking', 'scratch', 'streak', 'adjustment'].map((source) => {
          const row = figures.stamps.find((r) => r.source === source)
          return {
            source,
            label: STAMP_LABELS[source as keyof typeof STAMP_LABELS],
            earned: row?.n ?? 0,
            used: row?.used ?? 0,
            lapsed: row?.lapsed ?? 0,
            removed: row?.removed ?? 0,
          }
        }),
        lapsedThisMonth: figures.stampsLapsed,
      },
      bookings: figures.judged,
      scratch: {
        outcomes: SCRATCH_OUTCOMES.map((outcome) => ({
          outcome,
          label: scratchPrizeLabel(outcome, outcome === 'bonus_stamp' ? null : settings.scratchAmounts[outcome]),
          weight: settings.scratchWeights[outcome],
          drawn: figures.outcomes.filter((r) => r.drawn === outcome).reduce((s, r) => s + r.n, 0),
          given: figures.outcomes.filter((r) => r.outcome === outcome).reduce((s, r) => s + r.n, 0),
          scratched: figures.outcomes.filter((r) => r.outcome === outcome).reduce((s, r) => s + r.scratched, 0),
        })),
        fellBack: figures.outcomes.filter((r) => r.outcome !== r.drawn).reduce((s, r) => s + r.n, 0),
        expiredUnscratched: figures.cardsExpired,
      },
      levels: {
        distribution: LEVELS.map((level) => ({ level, label: levelFigure(level), customers: moves.distribution[level] })),
        movedUp: moves.up,
        movedDown: moves.down,
        noShowDrops: figures.noShowDrops,
        customers: people.length,
      },
      streaks,
      referrals: { month: funnel, allTime: funnelAll },
      topCustomers: top.map((row) => ({ ...row, phone: maskPhone(row.phone) })),
      flagged: flagged.filter((row) => heavyDiscountFlag(row)).map((row) => ({ ...row, phone: maskPhone(row.phone) })),
    }
  },

  /** Every rewards event of a month, for the CSV export (phones masked). */
  async adminLedger(monthKey: string | undefined, now = new Date()) {
    const month = monthKey ?? istMonthKey(now)
    const rows = await rewardsRepository.ledger(month)
    return {
      month,
      rows: rows.map((row) => ({ ...row, at: row.at.toISOString(), phone: maskPhone(row.phone) })),
    }
  },

  async adminCustomer(userId: string, now = new Date()) {
    const customer = await rewardsRepository.findCustomerById(userId)
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
    return rewardsService.adminCustomerView(customer, now)
  },

  async adminFind(phone: string, now = new Date()) {
    const customer = await rewardsRepository.findCustomerByPhone(phone)
    if (!customer) throw new AppError(404, 'No customer has that phone number', 'CUSTOMER_NOT_FOUND')
    return rewardsService.adminCustomerView(customer, now)
  },

  /** One customer: their card, level, everything issued, and a timeline of every stamp, card and voucher with its booking. */
  async adminCustomerView(
    customer: { id: string; name: string; phone: string; createdAt: Date; birthdayMonth: number | null; birthdayDay: number | null },
    now: Date
  ) {
    const { settings } = await currentSettings()
    const { stamps, card, level } = await cardAndLevel(customer.id, now, settings)
    const streak = streakView(await rewardsRepository.earnedMonths(customer.id, now), now, settings)
    const vouchers = (await rewardsRepository.listVouchers(customer.id, now)).map((row) => voucherView(row, now, settings, { admin: true }))
    const cardRows = await rewardsRepository.listScratchCards(customer.id, now)
    const judged = await rewardsRepository.listJudged(customer.id, 100)
    const drops = await rewardsRepository.listLevelDrops(customer.id, 20)
    const referrals = await rewardsRepository.listReferralsBy(customer.id)
    const referredBy = await rewardsRepository.findReferralOf(customer.id)
    const heavy = await rewardsRepository.heavyDiscountCountsOf(customer.id, now)
    const perks = await rewardsRepository.listPerks(customer.id)
    const lifetime = await rewardsRepository.lifetime(customer.id)

    const timeline = [
      ...judged.map((row) => ({
        at: row.completedAt.toISOString(),
        type: 'booking',
        title: !row.earned ? `No stamp: ${row.refusal ? stampRefusalLabel(row.refusal, settings) : ''}` : row.revokedAt ? `Stamp taken back (${row.revokeReason})` : 'Stamp earned',
        detail: `${row.vendorName ?? ''} · ₹${Math.round(Number(row.eligibleAmount))} · ${row.discountPercent}% off`,
        bookingId: row.bookingId as string | null,
      })),
      ...stamps
        .filter((stamp) => stamp.source !== 'booking')
        .map((stamp) => ({
          at: stamp.earnedAt.toISOString(),
          type: 'stamp',
          title: STAMP_LABELS[stamp.source],
          detail: [stamp.streakMonth, stamp.reason, stamp.actorName, stamp.voidReason].filter(Boolean).join(' · '),
          bookingId: stamp.bookingId as string | null,
        })),
      ...cardRows.map((row) => ({
        at: row.createdAt.toISOString(),
        type: 'scratch_card',
        title: `Scratch card: ${scratchPrizeLabel(row.outcome, row.prizeAmount)}${row.fellBack ? ` (budget: drew ${row.drawnOutcome})` : ''}`,
        detail: [levelLabel(settings, row.level) + ' odds', row.scratchedAt ? 'scratched' : row.voidedAt ? 'withdrawn' : 'not scratched'].join(' · '),
        bookingId: row.bookingId ?? row.rootBookingId,
      })),
      ...vouchers.map((v) => ({
        at: v.issuedAt,
        type: 'voucher',
        title: `${v.label}: ₹${Math.round(Number(v.amount))}`,
        detail: [v.state, v.code, v.reason, v.actorName].filter(Boolean).join(' · '),
        bookingId: v.bookingId ?? v.sourceBookingId,
      })),
      ...drops.map((row) => ({
        at: row.droppedAt.toISOString(),
        type: 'level_drop',
        title: `No-show: ${levelLabel(settings, row.fromLevel)} → ${levelLabel(settings, row.toLevel)}`,
        detail: '',
        bookingId: row.rootBookingId as string | null,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at))

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        joinedAt: customer.createdAt.toISOString(),
        birthday: customer.birthdayMonth && customer.birthdayDay ? `${customer.birthdayDay} ${MONTHS[customer.birthdayMonth - 1]}` : null,
      },
      card,
      level,
      streak,
      lifetime: { ...lifetime, since: lifetime.since?.toISOString() ?? null },
      flagged: heavyDiscountFlag(heavy),
      heavyDiscount: heavy,
      stamps: stamps.map((stamp) => stampView(stamp, now)),
      vouchers,
      scratchCards: cardRows.map((row) => ({
        ...cardView(row, now),
        // Admin sees the prize drawn even before the customer scratches.
        drawn: { outcome: row.outcome, label: scratchPrizeLabel(row.outcome, row.prizeAmount), fellBack: row.fellBack },
      })),
      perks: perks.map((row) => ({ ...row, label: VOUCHER_LABELS[row.kind], createdAt: row.createdAt.toISOString() })),
      timeline,
      referrals: referrals.map((row) => ({
        ...row,
        refereeName: row.refereeName ? firstNameOf(row.refereeName) : 'Deleted account',
        claimedAt: row.claimedAt.toISOString(),
        settledAt: row.settledAt?.toISOString() ?? null,
      })),
      referredBy: referredBy ? { firstName: firstNameOf(referredBy.referrerName), status: referredBy.status } : null,
    }
  },

  async adminAdjust(input: { userId: string; actorSub: string } & AdjustRewardsInput, now = new Date()) {
    const customer = await rewardsRepository.findCustomerById(input.userId)
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
    const { settings } = await currentSettings()
    const action =
      input.action === 'add_stamps' || input.action === 'remove_stamps'
        ? { kind: input.action, stamps: input.stamps ?? 0 }
        : input.action === 'issue_voucher'
          ? { kind: input.action, amount: input.amount ?? 0 }
          : { kind: input.action, voucherId: input.voucherId ?? '' }
    const result = await rewardsRepository.adjust({
      userId: input.userId,
      action,
      reason: input.reason,
      actorName: input.actorName,
      actorSub: input.actorSub,
      now,
      settings,
    })
    if (result.kind === 'refused') {
      switch (result.refusal) {
        case 'zero':
          throw new AppError(400, 'Enter a number of stamps', 'REWARD_ADJUSTMENT_ZERO')
        case 'too_large':
          throw new AppError(400, `At most ${REWARDS_FIXED.maxAdjustmentStamps} stamps at a time`, 'REWARD_ADJUSTMENT_TOO_LARGE')
        case 'over_card':
          throw new AppError(409, "That's more stamps than are on the card", 'REWARD_ADJUSTMENT_OVER_CARD')
        case 'voucher_amount':
          throw new AppError(400, `A voucher from the team is ₹1 to ₹${REWARDS_FIXED.maxAdjustmentVoucher}`, 'REWARD_ADJUSTMENT_AMOUNT')
        case 'voucher_not_found':
          throw new AppError(404, 'Voucher not found', 'REWARD_VOUCHER_NOT_FOUND')
        case 'voucher_cancelled':
          throw new AppError(409, 'That voucher is already cancelled', 'REWARD_VOUCHER_CANCELLED')
        case 'voucher_spent':
          throw new AppError(409, 'That voucher is on a booking. Cancel the booking first to give it back.', 'REWARD_VOUCHER_SPENT')
      }
    }
    log.info({ userId: input.userId, action: input.action, actorName: input.actorName }, 'rewards:adjusted')
    announce(result.issued, result.capAlert, settings)
    return rewardsService.adminCustomerView(customer, now)
  },
}
