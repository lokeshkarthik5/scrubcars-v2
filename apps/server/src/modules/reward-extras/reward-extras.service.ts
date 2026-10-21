import { AppError } from '../../lib/errors.js'
import { firstNameOf } from '../../lib/home-updates.js'
import { addDays, istDateKey } from '../../lib/ist.js'
import { logger } from '../../lib/logger.js'
import { customerRewardNudge } from '../../lib/push-messages.js'
import {
  BADGES,
  badgeCheckDayStart,
  badgeDefinition,
  badgeEarnedWords,
  badgeProgress,
  isCelebrationHour,
} from '../../lib/achievements.js'
import {
  challengeOneLeftWords,
  challengeProblems,
  challengeStartWords,
  challengeStatus,
  challengeWonWords,
  countsLine,
  daysLeft,
  editRefusal,
  inAudience,
  progressLine,
  publishProblem,
  rewardLabel,
  worstCaseVoucherCost,
  type Challenge,
  type ChallengeInput,
} from '../../lib/challenges.js'
import {
  achievementSettings,
  isNudgeRun,
  istMonthKey,
  istMonthRange,
  levelFor,
  levelLabel,
  maskPhone,
  type BadgeKey,
  type NudgeKind,
  type RewardsSettings,
} from '../../lib/rewards.js'
import { buildWrapped, isWrappedPushWindow, levelMoment, wrappedAvailable, wrappedPushWords, wrappedStale, wrappedYears, yearRange } from '../../lib/wrapped.js'
import { pushService } from '../push/push.service.js'
import { announceRewards } from '../rewards/rewards.announce.js'
import { rewardsRepository } from '../rewards/rewards.repository.js'
import { currentSettings, rewardsLive } from '../rewards/rewards.settings.js'
import { rewardExtrasRepository, toChallenge, type AwardedBadge, type CountResult } from './reward-extras.repository.js'
import type { ChallengeBody } from './reward-extras.validation.js'

const log = logger.child({ module: 'reward-extras' })

const DAY_MS = 24 * 60 * 60 * 1000
/** The cron's catch-up looks back this far for stamps not yet counted for badges and challenges. */
const CATCH_UP_LOOKBACK_MS = 2 * DAY_MS
const CATCH_UP_BATCH = 30
const BADGE_CHECK_BATCH = 40
/** Celebrations not yet sent (earned at night, or a push that failed to claim) are looked for this far back. */
const CELEBRATE_LOOKBACK_MS = 3 * DAY_MS
const CELEBRATE_BATCH = 50
const START_BATCH = 100
const ONE_LEFT_BATCH = 50
const WRAPPED_PUSH_BATCH = 100
const SWEEP_BUDGET_MS = 10_000
/** Finished challenges stay on the customer's page this long if they took part. */
const RECENT_CHALLENGE_DAYS = 7

export const REWARDS_PAGE = '/profile/rewards'

function badgeLabel(award: { key: BadgeKey | 'challenge'; challengeTitle?: string | null }): string {
  return award.key === 'challenge' ? (award.challengeTitle ?? 'Challenge') : badgeDefinition(award.key).label
}

/**
 * Sends a rewards nudge once: claimed in reward_nudges (0050's machinery,
 * which also makes it an Updates row), then pushed (the Reminders switch
 * applies). A celebration skips the gap; anything else waits for it.
 */
type Telling = { userId: string; kind: NudgeKind; subjectKey: string; title: string; body: string; url: string }

function claim(input: Telling, now: Date, settings: RewardsSettings): Promise<boolean> {
  return rewardsRepository.claimNudge({
    userId: input.userId,
    kind: input.kind,
    subjectKey: input.subjectKey,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 200),
    linkUrl: input.url,
    now,
    gapDays: settings.nudgeGapDays,
  })
}

async function push(input: Telling) {
  await pushService.sendNow(
    { audience: 'customer', userId: input.userId },
    customerRewardNudge({ kind: input.kind, subjectKey: input.subjectKey, words: { title: input.title, body: input.body, url: input.url } })
  )
}

async function tell(input: Telling, now: Date, settings: RewardsSettings): Promise<boolean> {
  if (!(await claim(input, now, settings))) return false
  await push(input)
  return true
}

/**
 * Badges earned together (a first booking can reach two; the first nightly
 * pass after launch can reach many): each is claimed once (its own Updates
 * row), but the phone hears once, "3 badges earned", not three times.
 */
async function celebrateBadges(
  userId: string,
  awards: Array<AwardedBadge & { challengeTitle?: string | null }>,
  now: Date,
  settings: RewardsSettings
): Promise<number> {
  const told: Array<{ telling: Telling; label: string }> = []
  for (const award of awards) {
    const label = badgeLabel(award)
    const telling: Telling = { userId, kind: 'badge', subjectKey: `badge:${award.id}`, ...badgeEarnedWords(label, award.bonusStamps), url: `${REWARDS_PAGE}?badge=${award.id}` }
    if (await claim(telling, now, settings)) told.push({ telling, label })
  }
  if (told.length === 1) await push(told[0].telling)
  if (told.length > 1) {
    const names = told.map((t) => t.label)
    await push({
      ...told[0].telling,
      title: `${told.length} badges earned`,
      body: `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''}. See them in your cabinet.`,
      url: REWARDS_PAGE,
    })
  }
  return told.length
}

function celebrateWin(userId: string, challenge: Challenge, now: Date, settings: RewardsSettings) {
  const words = challengeWonWords(challenge)
  return tell(
    { userId, kind: 'challenge_won', subjectKey: `challenge_won:${challenge.id}`, ...words, url: `${REWARDS_PAGE}?challenge=${challenge.id}` },
    now,
    settings
  )
}

function tellOneLeft(userId: string, challenge: Challenge, now: Date, settings: RewardsSettings) {
  const words = challengeOneLeftWords(challenge)
  return tell(
    { userId, kind: 'challenge_one_left', subjectKey: `challenge_one_left:${challenge.id}`, ...words, url: `${REWARDS_PAGE}?challenge=${challenge.id}` },
    now,
    settings
  )
}

function tellStart(userId: string, challenge: Challenge, now: Date, settings: RewardsSettings) {
  const words = challengeStartWords(challenge)
  return tell(
    { userId, kind: 'challenge_start', subjectKey: `challenge_start:${challenge.id}`, ...words, url: `${REWARDS_PAGE}?challenge=${challenge.id}` },
    now,
    settings
  )
}

/** A challenge as the customer's page shows it. */
function challengeView(c: Challenge, standing: { count: number; wonAt: Date | null; winners: number }, now: Date) {
  const left = daysLeft(c, now)
  const won = standing.wonAt !== null
  const full = !won && c.maxWinners !== null && standing.winners >= c.maxWinners
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    reward: rewardLabel(c),
    rewardKind: c.rewardKind,
    counts: countsLine(c),
    startDate: c.startDate,
    endDate: c.endDate,
    status: challengeStatus(c, now),
    goal: c.goalCount,
    count: Math.min(standing.count, c.goalCount),
    daysLeft: left,
    won,
    wonAt: standing.wonAt?.toISOString() ?? null,
    full,
    line: progressLine({ count: standing.count, goal: c.goalCount, daysLeft: left, won, full }),
  }
}

export type CustomerChallenge = ReturnType<typeof challengeView>

/** A challenge as admin lists it. */
function adminChallengeView(
  c: Challenge,
  row: { createdBy: string; createdAt: Date; publishedBy: string | null; endedBy: string | null },
  figures: { participants: number; winners: number; voucherCost: string; stamps: number } | undefined,
  now: Date,
  settings: RewardsSettings
) {
  const worst = worstCaseVoucherCost(c)
  return {
    ...c,
    publishedAt: c.publishedAt?.toISOString() ?? null,
    endedAt: c.endedAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    publishedBy: row.publishedBy,
    endedBy: row.endedBy,
    status: challengeStatus(c, now),
    reward: rewardLabel(c),
    counts: countsLine(c),
    participants: figures?.participants ?? 0,
    winners: figures?.winners ?? 0,
    cost: { vouchers: figures?.voucherCost ?? '0.00', stamps: figures?.stamps ?? 0 },
    worstCaseVoucherCost: worst,
    // The month's budget is the one cap on rewards; a prize that could take all of it is worth a second look.
    overBudget: worst !== null && worst > settings.monthlyCap,
  }
}

export const rewardExtrasService = {
  // ─── Earning ──────────────────────────────────────────────────────────────

  /**
   * A booking's stamp was just earned (0050's judge committed): counts it for
   * the live challenges it fits and awards any badge now reached, once. Then,
   * outside the transaction: new vouchers and the cap as 0050 announces them,
   * each badge and win celebrated, and "one more to go" (gap-limited). A
   * customer's own completion is news at once from 08:00 to 20:59 IST; at
   * night it waits for the cron's morning run.
   */
  async onStampEarned(userId: string, rootBookingId: string, now = new Date()): Promise<CountResult | null> {
    if (!(await rewardsLive())) return null
    const { settings } = await currentSettings()
    const result = await rewardExtrasRepository.countStamp({
      userId,
      rootBookingId,
      now,
      settings,
      achievements: achievementSettings(settings),
    })
    if (result.kind !== 'counted') return result
    if (result.badges.length > 0 || result.wins.length > 0) {
      log.info(
        { userId, rootBookingId, badges: result.badges.map((b) => b.key), wins: result.wins.map((w) => w.challenge.id) },
        'rewards:extras_earned'
      )
    }
    announceRewards(result.vouchers, result.capAlert, settings)
    if (isCelebrationHour(now)) {
      const titles = new Map(result.wins.map((win) => [win.challenge.id, win.challenge.title]))
      await celebrateBadges(
        userId,
        result.badges.map((badge) => ({ ...badge, challengeTitle: badge.challengeId ? titles.get(badge.challengeId) : null })),
        now,
        settings
      )
      for (const win of result.wins) await celebrateWin(userId, win.challenge, now, settings)
      for (const challenge of result.oneLeft) await tellOneLeft(userId, challenge, now, settings)
    }
    return result
  },

  // ─── The cron ─────────────────────────────────────────────────────────────

  /**
   * The pending-digest cron's part, only while rewards are live: stamps not
   * yet counted for badges and challenges (last 2 days), the nightly badge
   * pass (each customer once a day from 02:00 IST, and again after a review
   * or a rewarded invite), celebrations that waited for the morning; then,
   * in the 10:00–17:59 IST runs, "a challenge has started", "one more to
   * go", and in 1–7 December "Your Detlio Wrapped is here". Bounded
   * batches, 10-second budget.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    if (!(await rewardsLive())) return { enabled: false as const }
    const { settings } = await currentSettings()
    const achievements = achievementSettings(settings)
    const started = Date.now()
    const outOfTime = () => Date.now() - started > SWEEP_BUDGET_MS
    const summary = {
      enabled: true as const,
      counted: 0,
      badgeChecks: 0,
      badges: 0,
      celebrated: 0,
      starts: 0,
      oneLeft: 0,
      wrapped: 0,
      failed: 0,
      outOfTime: false,
    }
    const done = () => ({ ...summary, outOfTime: true })

    if (!options.dryRun) {
      for (const row of await rewardExtrasRepository.listUncounted(new Date(now.getTime() - CATCH_UP_LOOKBACK_MS), CATCH_UP_BATCH)) {
        if (outOfTime()) return done()
        try {
          const result = await rewardExtrasService.onStampEarned(row.userId, row.rootBookingId, now)
          if (result?.kind === 'counted') summary.counted += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, rootBookingId: row.rootBookingId }, 'rewards:extras_catch_up_failed')
        }
      }
      for (const userId of await rewardExtrasRepository.listBadgeCheckCandidates(badgeCheckDayStart(now), BADGE_CHECK_BATCH)) {
        if (outOfTime()) return done()
        try {
          const result = await rewardExtrasRepository.checkBadges({ userId, now, settings, achievements })
          summary.badgeChecks += 1
          summary.badges += result.badges.length
          announceRewards(result.vouchers, result.capAlert, settings)
        } catch (err) {
          summary.failed += 1
          log.error({ err, userId }, 'rewards:badge_check_failed')
        }
      }
      if (isCelebrationHour(now)) {
        const since = new Date(now.getTime() - CELEBRATE_LOOKBACK_MS)
        const byCustomer = new Map<string, Awaited<ReturnType<typeof rewardExtrasRepository.listUncelebratedBadges>>>()
        for (const award of await rewardExtrasRepository.listUncelebratedBadges(since, CELEBRATE_BATCH)) {
          byCustomer.set(award.userId, [...(byCustomer.get(award.userId) ?? []), award])
        }
        for (const [userId, awards] of byCustomer) {
          if (outOfTime()) return done()
          try {
            summary.celebrated += await celebrateBadges(userId, awards, now, settings)
          } catch (err) {
            summary.failed += 1
            log.error({ err, userId }, 'rewards:badge_celebration_failed')
          }
        }
        for (const win of await rewardExtrasRepository.listUncelebratedWins(since, CELEBRATE_BATCH)) {
          if (outOfTime()) return done()
          try {
            if (await celebrateWin(win.userId, win.challenge, now, settings)) summary.celebrated += 1
          } catch (err) {
            summary.failed += 1
            log.error({ err, challengeId: win.challenge.id }, 'rewards:win_celebration_failed')
          }
        }
      }
    }

    if (!isNudgeRun(now)) return summary

    // Challenges live now that started in the last 3 days: tell the audience once.
    const today = istDateKey(now)
    const live = (await rewardExtrasRepository.listPublishedAround(today, today)).filter((c) => challengeStatus(c, now) === 'live')
    const quietSince = new Date(now.getTime() - settings.nudgeGapDays * DAY_MS)
    for (const challenge of live.filter((c) => c.startDate >= addDays(today, -2))) {
      const candidates = await rewardExtrasRepository.listStartCandidates(challenge.id, quietSince, START_BATCH)
      const levels = challenge.audienceMinLevel ? await rewardsRepository.levelFactsMany(candidates, now, settings) : null
      const audience = candidates.filter((userId) => {
        if (!levels) return true
        const facts = levels.get(userId) ?? { bookings: 0, drops: 0 }
        return inAudience(challenge, levelFor(facts.bookings, facts.drops, settings))
      })
      if (options.dryRun) {
        summary.starts += audience.length
        continue
      }
      for (const userId of audience) {
        if (outOfTime()) return done()
        try {
          if (await tellStart(userId, challenge, now, settings)) summary.starts += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, userId, challengeId: challenge.id }, 'rewards:challenge_start_failed')
        }
      }
    }
    for (const challenge of live) {
      const candidates = await rewardExtrasRepository.listOneLeftCandidates(challenge, ONE_LEFT_BATCH)
      if (options.dryRun) {
        summary.oneLeft += candidates.length
        continue
      }
      for (const userId of candidates) {
        if (outOfTime()) return done()
        try {
          if (await tellOneLeft(userId, challenge, now, settings)) summary.oneLeft += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, userId, challengeId: challenge.id }, 'rewards:challenge_one_left_failed')
        }
      }
    }

    // Detlio Wrapped: "it's here", once a year, early December.
    if (isWrappedPushWindow(now)) {
      const year = Number(today.slice(0, 4))
      const candidates = await rewardExtrasRepository.listWrappedPushCandidates(year, WRAPPED_PUSH_BATCH)
      if (options.dryRun) return { ...summary, wrapped: candidates.length }
      const words = wrappedPushWords(year)
      for (const userId of candidates) {
        if (outOfTime()) return done()
        try {
          if (await tell({ userId, kind: 'wrapped', subjectKey: `wrapped:${year}`, ...words }, now, settings)) summary.wrapped += 1
        } catch (err) {
          summary.failed += 1
          log.error({ err, userId }, 'rewards:wrapped_push_failed')
        }
      }
    }
    return summary
  },

  // ─── The customer ─────────────────────────────────────────────────────────

  /**
   * The Rewards page's extras: the badge cabinet (earned in colour, locked
   * with how to earn and how far along), badges not celebrated yet, the
   * live challenges (in the customer's audience) with their progress, and
   * the Wrapped years open to them.
   */
  async extras(userId: string, now = new Date()) {
    const { settings } = await currentSettings()
    const achievements = achievementSettings(settings)
    const awards = await rewardExtrasRepository.listAwards(userId)
    const facts = await rewardExtrasRepository.badgeFacts(userId)
    const earned = new Map(awards.filter((a) => a.key !== 'challenge').map((a) => [a.key, a]))
    const badges = BADGES.filter((badge) => achievements[badge.key].enabled || earned.has(badge.key)).map((badge) => {
      const award = earned.get(badge.key)
      return {
        key: badge.key,
        label: badge.label,
        howTo: badge.howTo,
        bonusStamps: award ? award.bonusStamps : achievements[badge.key].bonusStamps,
        progress: badgeProgress(badge.key, facts),
        earned: award ? { id: award.id, at: award.earnedAt.toISOString() } : null,
      }
    })
    const challengeBadges = awards
      .filter((a) => a.key === 'challenge')
      .map((a) => ({ id: a.id, label: a.challengeTitle ?? 'Challenge', challengeId: a.challengeId, at: a.earnedAt.toISOString() }))
    const unseen = awards
      .filter((a) => !a.seenAt)
      .map((a) => ({
        id: a.id,
        key: a.key,
        label: badgeLabel({ key: a.key, challengeTitle: a.challengeTitle }),
        howTo: a.key === 'challenge' ? 'Won a Detlio challenge.' : badgeDefinition(a.key).howTo,
        bonusStamps: a.bonusStamps,
        at: a.earnedAt.toISOString(),
      }))
    const challenges = await rewardExtrasService.customerChallenges(userId, now, settings)
    const years = await rewardExtrasService.wrappedYearsFor(userId, now)
    return {
      badges,
      challengeBadges,
      earnedCount: badges.filter((b) => b.earned).length + challengeBadges.length,
      unseen,
      challenges,
      wrapped: { years },
    }
  },

  /** Live challenges for the customer's level, and ones that ended in the last week they took part in. */
  async customerChallenges(userId: string, now: Date, settings: RewardsSettings) {
    const today = istDateKey(now)
    const around = await rewardExtrasRepository.listPublishedAround(addDays(today, -RECENT_CHALLENGE_DAYS), today)
    // Most days there is no challenge: one indexed read and done.
    if (around.length === 0) return []
    const standings = await rewardExtrasRepository.standings(userId, around.map((c) => c.id))
    // The level is read only when a challenge is for some levels.
    let level: ReturnType<typeof levelFor> = 'member'
    if (around.some((c) => c.audienceMinLevel)) {
      const facts = await rewardsRepository.levelFacts(userId, now, settings)
      level = levelFor(facts.completedAt.length, facts.drops, settings)
    }
    return around
      .filter((c) => {
        const status = challengeStatus(c, now)
        const standing = standings.get(c.id) ?? { count: 0, wonAt: null, winners: 0 }
        if (status === 'live') return inAudience(c, level) || standing.count > 0
        if (status === 'finished' || status === 'ended') return standing.count > 0
        return false
      })
      .map((c) => challengeView(c, standings.get(c.id) ?? { count: 0, wonAt: null, winners: 0 }, now))
      // Still to play for first, then the soonest to end.
      .sort((a, b) => Number(a.won || a.daysLeft === 0) - Number(b.won || b.daysLeft === 0) || a.endDate.localeCompare(b.endDate))
  },

  /** Home's and Profile's part: badge counts, badges to celebrate, the challenge to show, Wrapped. */
  async summary(userId: string, now = new Date()) {
    const { settings } = await currentSettings()
    const achievements = achievementSettings(settings)
    const awards = await rewardExtrasRepository.listAwards(userId)
    const shown = BADGES.filter((badge) => achievements[badge.key].enabled || awards.some((a) => a.key === badge.key)).length
    const challenges = await rewardExtrasService.customerChallenges(userId, now, settings)
    const challenge = challenges.find((c) => c.status === 'live' && !c.won && !c.full) ?? null
    const years = await rewardExtrasService.wrappedYearsFor(userId, now)
    return {
      badgesEarned: awards.length,
      badgesTotal: shown + awards.filter((a) => a.key === 'challenge').length,
      unseen: awards
        .filter((a) => !a.seenAt)
        .map((a) => ({
          id: a.id,
          key: a.key,
          label: badgeLabel({ key: a.key, challengeTitle: a.challengeTitle }),
          howTo: a.key === 'challenge' ? 'Won a Detlio challenge.' : badgeDefinition(a.key).howTo,
          bonusStamps: a.bonusStamps,
          at: a.earnedAt.toISOString(),
        })),
      challenge,
      wrappedYear: years[0] ?? null,
    }
  },

  async markSeen(userId: string, ids: string[], now = new Date()) {
    return { seen: await rewardExtrasRepository.markSeen(userId, ids, now) }
  },

  /** The Wrapped years open now in which the customer has at least one wash. */
  async wrappedYearsFor(userId: string, now: Date): Promise<number[]> {
    const open = wrappedYears(now)
    if (open.length === 0) return []
    const washes = await rewardExtrasRepository.washesInYears(userId, open)
    return open.filter((year) => (washes.get(year) ?? 0) > 0)
  },

  /**
   * One customer-year's Wrapped: from the cache, else worked out (bounded
   * reads) and cached. A customer only for the years open now (404
   * otherwise); admin's preview any year.
   */
  async wrapped(userId: string, year: number, now = new Date(), options: { admin: boolean } = { admin: false }) {
    if (!options.admin && !wrappedAvailable(year, now)) {
      throw new AppError(404, "Your Detlio Wrapped for that year isn't open.", 'WRAPPED_NOT_AVAILABLE')
    }
    const cached = await rewardExtrasRepository.findWrapped(userId, year)
    if (cached && !wrappedStale(cached.computedAt, year, now)) return cached.stats
    const { settings } = await currentSettings()
    const at = levelMoment(year, now)
    const facts = await rewardExtrasRepository.wrappedFacts(userId, year, at, settings)
    const name = await rewardExtrasRepository.findFirstName(userId)
    const stats = buildWrapped({
      year,
      now,
      firstName: name ? firstNameOf(name) : null,
      bookings: facts.bookings,
      savedPaise: facts.savedPaise,
      level: { key: facts.level, label: levelLabel(settings, facts.level) },
      badgeNames: facts.badges.map((b) => badgeLabel({ key: b.key, challengeTitle: b.challengeTitle })),
    })
    if (stats.washes === 0 && !options.admin) {
      throw new AppError(404, `No washes through Detlio in ${year} yet.`, 'WRAPPED_NOT_AVAILABLE')
    }
    await rewardExtrasRepository.saveWrapped(userId, year, stats, now)
    return stats
  },

  /** Opened or shared: counted, nothing else (no image, no where). */
  async wrappedEvent(userId: string, year: number, kind: 'opened' | 'shared', now = new Date()) {
    if (!wrappedAvailable(year, now)) throw new AppError(404, "Your Detlio Wrapped for that year isn't open.", 'WRAPPED_NOT_AVAILABLE')
    const recorded = await rewardExtrasRepository.recordWrappedEvent(userId, year, kind, now)
    return { recorded }
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** Every badge: on or off, bonus stamps, and how many customers earned it (ever, this month). */
  async adminAchievements(now = new Date()) {
    const current = await currentSettings(0)
    const achievements = achievementSettings(current.settings)
    const counts = await rewardExtrasRepository.badgeCounts(istMonthRange(istMonthKey(now)).start)
    return {
      version: current.version,
      badges: BADGES.map((badge) => {
        const row = counts.find((c) => c.key === badge.key)
        return {
          key: badge.key,
          label: badge.label,
          howTo: badge.howTo,
          goal: badge.goal,
          enabled: achievements[badge.key].enabled,
          bonusStamps: achievements[badge.key].bonusStamps,
          earned: row?.total ?? 0,
          earnedThisMonth: row?.thisMonth ?? 0,
          stampsGiven: row?.stamps ?? 0,
        }
      }),
      challengeBadges: counts.find((c) => c.key === 'challenge')?.total ?? 0,
    }
  },

  async adminChallenges(now = new Date()) {
    const { settings } = await currentSettings()
    const rows = await rewardExtrasRepository.listChallenges()
    const figures = await rewardExtrasRepository.challengeFigures(rows.map((row) => row.id))
    return { challenges: rows.map((row) => adminChallengeView(toChallenge(row), row, figures.get(row.id), now, settings)) }
  },

  async adminChallenge(id: string, now = new Date()) {
    const row = await rewardExtrasRepository.findChallenge(id)
    if (!row) throw new AppError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND')
    const { settings } = await currentSettings()
    const figures = await rewardExtrasRepository.challengeFigures([id])
    const results = await rewardExtrasRepository.challengeResults(id, 200)
    return {
      challenge: adminChallengeView(toChallenge(row), row, figures.get(id), now, settings),
      results: results.map((r) => ({
        ...r,
        phone: maskPhone(r.phone),
        firstCountedAt: r.firstCountedAt.toISOString(),
        wonAt: r.wonAt?.toISOString() ?? null,
      })),
    }
  },

  /** Every participant for the CSV (phones masked, like the rewards ledger). */
  async adminChallengeResults(id: string) {
    const row = await rewardExtrasRepository.findChallenge(id)
    if (!row) throw new AppError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND')
    const results = await rewardExtrasRepository.challengeResults(id, 20000)
    return {
      challenge: { id: row.id, title: row.title, startDate: String(row.startDate), endDate: String(row.endDate) },
      rows: results.map((r) => ({
        ...r,
        phone: maskPhone(r.phone),
        firstCountedAt: r.firstCountedAt.toISOString(),
        wonAt: r.wonAt?.toISOString() ?? null,
      })),
    }
  },

  async createChallenge(input: ChallengeBody & { actorSub: string }, now = new Date()) {
    const problems = challengeProblems(input)
    if (problems.length > 0) throw new AppError(400, problems.join(' · '), 'CHALLENGE_INVALID')
    const row = await rewardExtrasRepository.createChallenge({ ...input, now })
    log.info({ challengeId: row.id, actorName: input.actorName }, 'rewards:challenge_created')
    return rewardExtrasService.adminChallenge(row.id, now)
  },

  async updateChallenge(id: string, input: ChallengeBody & { actorSub: string }, now = new Date()) {
    const problems = challengeProblems(input)
    if (problems.length > 0) throw new AppError(400, problems.join(' · '), 'CHALLENGE_INVALID')
    const next: ChallengeInput = input
    const result = await rewardExtrasRepository.updateChallenge({
      id,
      next,
      actorName: input.actorName,
      actorSub: input.actorSub,
      now,
      decide: (current) => {
        const c = toChallenge(current)
        return editRefusal({ ...c }, next, now)
      },
    })
    if (result.kind === 'not_found') throw new AppError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND')
    if (result.kind === 'refused') throw new AppError(409, result.reason, 'CHALLENGE_STARTED')
    log.info({ challengeId: id, actorName: input.actorName }, 'rewards:challenge_updated')
    return rewardExtrasService.adminChallenge(id, now)
  },

  /** Publishes (schedules) a draft: from today or later, never in the past. */
  async publishChallenge(id: string, actor: { actorName: string; actorSub: string }, now = new Date()) {
    const result = await rewardExtrasRepository.setChallengeState({
      id,
      action: 'publish',
      ...actor,
      now,
      decide: (current) => {
        const c = toChallenge(current)
        return challengeProblems(c)[0] ?? publishProblem(c, now)
      },
    })
    if (result.kind === 'not_found') throw new AppError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND')
    if (result.kind === 'refused') throw new AppError(409, result.reason, 'CHALLENGE_NOT_PUBLISHABLE')
    log.info({ challengeId: id, actorName: actor.actorName }, 'rewards:challenge_published')
    return rewardExtrasService.adminChallenge(id, now)
  },

  /** Ends a published challenge now (bookings starting after this no longer count; winners keep their prizes). */
  async endChallenge(id: string, actor: { actorName: string; actorSub: string }, now = new Date()) {
    const result = await rewardExtrasRepository.setChallengeState({
      id,
      action: 'end',
      ...actor,
      now,
      decide: (current) => {
        const status = challengeStatus(toChallenge(current), now)
        if (status === 'draft') return 'A draft is not running. Leave it as a draft.'
        if (status === 'finished' || status === 'ended') return 'This challenge is already over'
        return null
      },
    })
    if (result.kind === 'not_found') throw new AppError(404, 'Challenge not found', 'CHALLENGE_NOT_FOUND')
    if (result.kind === 'refused') throw new AppError(409, result.reason, 'CHALLENGE_NOT_RUNNING')
    log.info({ challengeId: id, actorName: actor.actorName }, 'rewards:challenge_ended')
    return rewardExtrasService.adminChallenge(id, now)
  },

  /** Wrapped for a year: customers with washes, told, made, opened, shared. Counts only. */
  async adminWrappedStats(year: number) {
    return { year, ...(await rewardExtrasRepository.wrappedStats(year)) }
  },

  /** Any customer's Wrapped, any year (admin preview); not counted as opened. */
  async adminCustomerWrapped(userId: string, year: number, now = new Date()) {
    const customer = await rewardsRepository.findCustomerById(userId)
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
    const range = yearRange(year)
    if (range.start > now) throw new AppError(400, 'That year has not started', 'WRAPPED_YEAR_INVALID')
    return rewardExtrasService.wrapped(userId, year, now, { admin: true })
  },
}
