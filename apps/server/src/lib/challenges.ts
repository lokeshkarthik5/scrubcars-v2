/**
 * Seasonal challenges (0054): "3 washes in Diwali week = double stamps".
 * Pure, with the clock and the facts passed in (challenges.test.ts). The
 * team creates them in Admin → Rewards → Challenges; a challenge is a
 * draft until published, and a published one is live from its start date
 * to its end date (IST, both included) unless ended early.
 *
 * **What counts** is what counts for the Shine Card: a booking that earned
 * a stamp and was not taken back (lib/achievements.ts says the same), whose
 * slot starts inside the window, optionally only one booking type and/or
 * one service category (a package counts for its members' categories).
 * Counted when the booking's stamp is judged (after Mark completed or
 * Delivered, or the cron's catch-up within 2 days), so a booking done on
 * the last evening can still win the next morning. Completions judged
 * before the challenge was published are not counted (publishing never
 * starts a challenge in the past).
 *
 * **Who**: everyone, or customers at a level or above (their level when
 * the booking is judged). **Winning**: the goal reached while the
 * challenge has winners left (`max_winners`, counted under the challenge's
 * lock); once, per customer. **Rewards** go through the rewards machinery:
 * bonus stamps on the Shine Card, a ₹ voucher (a Detlio-funded promo code,
 * counted toward the month's budget like every voucher), "double stamps"
 * (an extra stamp for each booking counted, those before the win included,
 * and each one after it until the window ends), or the challenge's badge.
 */
import { addDays, daysBetween, istDateKey, istMidnight } from './ist.js'
import { bannedPhraseIn } from './copy-rules.js'
import { LEVELS, type RewardLevel } from './rewards.js'

export const CHALLENGE_REWARD_KINDS = ['stamps', 'voucher', 'multiplier', 'badge'] as const
export type ChallengeRewardKind = (typeof CHALLENGE_REWARD_KINDS)[number]

export const CHALLENGE_CATEGORIES = ['car_wash', 'detailing', 'coating', 'scratch_removal', 'others', 'package'] as const
export type ChallengeCategory = (typeof CHALLENGE_CATEGORIES)[number]
export const CHALLENGE_BOOKING_TYPES = ['dropin', 'doorstep', 'pickup'] as const
export type ChallengeBookingType = (typeof CHALLENGE_BOOKING_TYPES)[number]

/** The limits of the admin form; the API holds them too. */
export const CHALLENGE_LIMITS = {
  title: { min: 3, max: 60 },
  description: { max: 200 },
  goal: { min: 1, max: 20 },
  stamps: { min: 1, max: 10 },
  amount: { min: 1, max: 2000 },
  multiplier: { min: 2, max: 3 },
  maxWinners: { min: 1, max: 100000 },
  /** A window of at most this many days. */
  windowDays: 92,
  /** Published at most this far ahead. */
  aheadDays: 366,
} as const

export interface Challenge {
  id: string
  title: string
  description: string | null
  /** IST dates, both included. */
  startDate: string
  endDate: string
  goalCount: number
  category: ChallengeCategory | null
  bookingType: ChallengeBookingType | null
  rewardKind: ChallengeRewardKind
  rewardStamps: number | null
  rewardAmount: number | null
  rewardMultiplier: number | null
  audienceMinLevel: RewardLevel | null
  maxWinners: number | null
  publishedAt: Date | null
  endedAt: Date | null
}

export type ChallengeStatus = 'draft' | 'scheduled' | 'live' | 'finished' | 'ended'

/** The window: the start date's first moment to the end date's last, cut short by an early end. */
export function challengeWindow(c: Pick<Challenge, 'startDate' | 'endDate' | 'endedAt'>): { start: Date; end: Date } {
  const start = istMidnight(c.startDate)
  const natural = istMidnight(addDays(c.endDate, 1))
  const end = c.endedAt && c.endedAt < natural ? new Date(Math.max(c.endedAt.getTime(), start.getTime())) : natural
  return { start, end }
}

export function challengeStatus(c: Pick<Challenge, 'startDate' | 'endDate' | 'endedAt' | 'publishedAt'>, now: Date): ChallengeStatus {
  if (!c.publishedAt) return 'draft'
  const natural = istMidnight(addDays(c.endDate, 1))
  if (c.endedAt && c.endedAt < natural && c.endedAt <= now) return 'ended'
  const { start, end } = challengeWindow(c)
  if (now < start) return 'scheduled'
  if (now >= end) return 'finished'
  return 'live'
}

/** Whether a booking counts toward a challenge: its slot in the window, the right type and category. */
export function bookingCounts(
  c: Pick<Challenge, 'startDate' | 'endDate' | 'endedAt' | 'category' | 'bookingType'>,
  booking: { startAt: Date; bookingType: string; categories: readonly string[] }
): boolean {
  const { start, end } = challengeWindow(c)
  if (booking.startAt < start || booking.startAt >= end) return false
  if (c.bookingType && booking.bookingType !== c.bookingType) return false
  if (c.category && !booking.categories.includes(c.category)) return false
  return true
}

/** Everyone, or customers at the level or above. */
export function inAudience(c: Pick<Challenge, 'audienceMinLevel'>, level: RewardLevel): boolean {
  if (!c.audienceMinLevel) return true
  return LEVELS.indexOf(level) >= LEVELS.indexOf(c.audienceMinLevel)
}

/** Days left including today ("4 days left"); 1 on the last day, 0 once over. */
export function daysLeft(c: Pick<Challenge, 'endDate' | 'endedAt' | 'startDate'>, now: Date): number {
  const { end } = challengeWindow(c)
  if (now >= end) return 0
  return Math.max(1, daysBetween(istDateKey(now), c.endDate) + 1)
}

export type ChallengeOutcome = 'already_won' | 'won' | 'full' | 'progress'

/**
 * What a counted booking does: wins (goal reached, winners left), finds the
 * prizes gone ('full'), or is progress. A customer wins once.
 */
export function challengeOutcome(input: {
  count: number
  goal: number
  alreadyWon: boolean
  winners: number
  maxWinners: number | null
}): ChallengeOutcome {
  if (input.alreadyWon) return 'already_won'
  if (input.count < input.goal) return 'progress'
  if (input.maxWinners !== null && input.winners >= input.maxWinners) return 'full'
  return 'won'
}

/** "Double stamps": the extra stamps a booking gets (one for double, two for triple). */
export function multiplierExtra(multiplier: number | null): number {
  return multiplier && multiplier > 1 ? Math.floor(multiplier) - 1 : 0
}

/** "1 more to go" is worth saying when there is more than one to do. */
export function oneLeftDue(count: number, goal: number): boolean {
  return goal >= 2 && count === goal - 1
}

/** What winning gives, in the app's words. */
export function rewardLabel(c: Pick<Challenge, 'rewardKind' | 'rewardStamps' | 'rewardAmount' | 'rewardMultiplier' | 'title'>): string {
  switch (c.rewardKind) {
    case 'stamps':
      return c.rewardStamps === 1 ? 'a bonus stamp' : `${c.rewardStamps ?? 0} bonus stamps`
    case 'voucher':
      return `₹${Math.round(c.rewardAmount ?? 0)} off`
    case 'multiplier':
      return c.rewardMultiplier === 3 ? 'triple stamps' : 'double stamps'
    case 'badge':
      return `the ${c.title} badge`
  }
}

/** "1 of 3 — 4 days left", "Won", "Ended". */
export function progressLine(input: { count: number; goal: number; daysLeft: number; won: boolean; full: boolean }): string {
  if (input.won) return 'You won'
  if (input.daysLeft === 0) return `${Math.min(input.count, input.goal)} of ${input.goal} — ended`
  if (input.full) return 'All prizes have been won'
  const left = input.daysLeft === 1 ? 'last day' : `${input.daysLeft} days left`
  return `${Math.min(input.count, input.goal)} of ${input.goal} — ${left}`
}

const CATEGORY_NOUNS: Record<ChallengeCategory, [string, string]> = {
  car_wash: ['wash', 'washes'],
  detailing: ['detailing job', 'detailing jobs'],
  coating: ['coating job', 'coating jobs'],
  scratch_removal: ['scratch removal', 'scratch removals'],
  others: ['booking', 'bookings'],
  package: ['package', 'packages'],
}

const TYPE_WORDS: Record<ChallengeBookingType, string> = { dropin: 'at-garage ', doorstep: 'doorstep ', pickup: 'pickup & drop ' }

/** What counts, in words: "3 washes", "2 doorstep washes", "1 coating job". */
export function countsLine(c: Pick<Challenge, 'goalCount' | 'category' | 'bookingType'>): string {
  const [one, many] = CATEGORY_NOUNS[c.category ?? 'car_wash']
  return `${c.goalCount} ${c.bookingType ? TYPE_WORDS[c.bookingType] : ''}${c.goalCount === 1 ? one : many}`
}

/** Push and Updates words. A title the team typed (it passed the copy rules); nothing about the customer. */
export function challengeStartWords(c: Challenge): { title: string; body: string } {
  const by = shortDay(c.endDate)
  return { title: `New challenge: ${c.title}`, body: `${capitalise(countsLine(c))} by ${by} wins ${rewardLabel(c)}.` }
}

export function challengeOneLeftWords(c: Challenge): { title: string; body: string } {
  return { title: `One more for ${c.title}`, body: `Book 1 more by ${shortDay(c.endDate)} to win ${rewardLabel(c)}.` }
}

export function challengeWonWords(c: Challenge): { title: string; body: string } {
  const what =
    c.rewardKind === 'multiplier'
      ? `${capitalise(rewardLabel(c))} on your washes in the challenge.`
      : c.rewardKind === 'voucher'
        ? `${rewardLabel(c)} your next booking is ready.`
        : `${capitalise(rewardLabel(c))} ${c.rewardKind === 'badge' ? 'is in your cabinet' : 'on your Shine Card'}.`
  return { title: `You won ${c.title}`, body: what }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDay(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export interface ChallengeInput {
  title: string
  description: string | null
  startDate: string
  endDate: string
  goalCount: number
  category: ChallengeCategory | null
  bookingType: ChallengeBookingType | null
  rewardKind: ChallengeRewardKind
  rewardStamps: number | null
  rewardAmount: number | null
  rewardMultiplier: number | null
  audienceMinLevel: RewardLevel | null
  maxWinners: number | null
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && istDateKey(istMidnight(value)) === value
}

/**
 * Every problem with a challenge as typed, in the form's order; empty when
 * it can be saved. A ₹ voucher prize needs a cap on winners (the budget's
 * worst case is winners × amount).
 */
export function challengeProblems(input: ChallengeInput): string[] {
  const L = CHALLENGE_LIMITS
  const problems: string[] = []
  const title = input.title.trim()
  if (title.length < L.title.min || title.length > L.title.max) problems.push(`The title is ${L.title.min}–${L.title.max} characters`)
  const banned = bannedPhraseIn(`${title} ${input.description ?? ''}`)
  if (banned) problems.push(`Detlio doesn't say "${banned}"`)
  if ((input.description ?? '').length > L.description.max) problems.push(`The description is at most ${L.description.max} characters`)
  if (!isDateKey(input.startDate) || !isDateKey(input.endDate)) problems.push('Pick a start and an end date')
  else {
    if (input.endDate < input.startDate) problems.push('The end date is after the start date')
    else if (daysBetween(input.startDate, input.endDate) + 1 > L.windowDays) problems.push(`A challenge runs at most ${L.windowDays} days`)
  }
  if (!Number.isInteger(input.goalCount) || input.goalCount < L.goal.min || input.goalCount > L.goal.max) {
    problems.push(`The goal is ${L.goal.min} to ${L.goal.max} bookings`)
  }
  const within = (v: number | null, limit: { min: number; max: number }) => v !== null && Number.isInteger(v) && v >= limit.min && v <= limit.max
  switch (input.rewardKind) {
    case 'stamps':
      if (!within(input.rewardStamps, L.stamps)) problems.push(`Bonus stamps are ${L.stamps.min} to ${L.stamps.max}`)
      break
    case 'voucher':
      if (!within(input.rewardAmount, L.amount)) problems.push(`The voucher is ₹${L.amount.min} to ₹${L.amount.max}`)
      if (input.maxWinners === null) problems.push('A ₹ prize needs a limit on winners')
      break
    case 'multiplier':
      if (!within(input.rewardMultiplier, L.multiplier)) problems.push('Stamps are doubled or tripled')
      break
    case 'badge':
      break
  }
  if (input.maxWinners !== null && !within(input.maxWinners, L.maxWinners)) {
    problems.push(`Winners are ${L.maxWinners.min} to ${L.maxWinners.max.toLocaleString('en-IN')}`)
  }
  return problems
}

/** Publishing: never in the past (completions before it would be missed), never too far ahead. */
export function publishProblem(c: Pick<Challenge, 'startDate' | 'endDate' | 'publishedAt'>, now: Date): string | null {
  if (c.publishedAt) return 'Already published'
  const today = istDateKey(now)
  if (c.startDate < today) return 'The start date has passed. Move it to today or later.'
  if (daysBetween(today, c.startDate) > CHALLENGE_LIMITS.aheadDays) return 'Publish it nearer the time (at most a year ahead)'
  return null
}

/** The most a challenge can cost in vouchers: winners × amount (null with no cap). */
export function worstCaseVoucherCost(c: Pick<Challenge, 'rewardKind' | 'rewardAmount' | 'maxWinners'>): number | null {
  if (c.rewardKind !== 'voucher') return 0
  if (c.maxWinners === null || c.rewardAmount === null) return null
  return c.maxWinners * c.rewardAmount
}

/**
 * What may change once published: before the start, everything; once it
 * has started, only the words and a higher winners cap (the rules people
 * are playing by stay put).
 */
export function editRefusal(
  c: Pick<Challenge, 'startDate' | 'endDate' | 'endedAt' | 'publishedAt'> & ChallengeInput,
  next: ChallengeInput,
  now: Date
): string | null {
  const status = challengeStatus(c, now)
  if (status === 'draft') return null
  // Scheduled: anything, but never a start that has passed (as publishing).
  if (status === 'scheduled') return next.startDate < istDateKey(now) ? 'The start date has passed. Move it to today or later.' : null
  if (status === 'finished' || status === 'ended') return 'This challenge is over'
  const fixed: Array<keyof ChallengeInput> = [
    'startDate',
    'endDate',
    'goalCount',
    'category',
    'bookingType',
    'rewardKind',
    'rewardStamps',
    'rewardAmount',
    'rewardMultiplier',
    'audienceMinLevel',
  ]
  for (const key of fixed) if (c[key] !== next[key]) return 'Once a challenge has started, only its words and a higher winners limit can change'
  if (c.maxWinners !== null && (next.maxWinners === null ? false : next.maxWinners < c.maxWinners)) {
    return 'The winners limit can only go up once it has started'
  }
  if (c.maxWinners !== null && next.maxWinners === null && c.rewardKind === 'voucher') return 'A ₹ prize needs a limit on winners'
  return null
}
