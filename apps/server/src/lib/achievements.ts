/**
 * Achievements (0054): the badges a customer earns with Detlio Rewards.
 * Pure: the facts, the settings and the clock come in as arguments, so
 * every rule is unit-tested (achievements.test.ts). What the team edits
 * (each badge on or off, its bonus stamps) is `RewardsSettings.achievements`
 * in lib/rewards.ts; the names and the rules are here, and the apps' words
 * are twinned in packages/core/src/achievements.ts (achievements.parity.test.ts).
 *
 * **What counts**: only completed bookings that earned a Shine Card stamp
 * and were not taken back (`reward_bookings.earned` and not revoked), the
 * stamps' own eligibility: completed, paid through Detlio, nothing refunded,
 * not Test-marked, at least the minimum (a free redo is under it), one per
 * car per IST day. A reward booking taken back later leaves an earned
 * badge where it is (like a voucher it already helped fill).
 *
 * Badges are evaluated when a booking earns its stamp, and nightly by the
 * cron (reviews, invites and a badge switched on later need no booking).
 * Each is earned once per customer (unique index); its bonus stamps go on
 * the Shine Card in the same transaction, under the customer's rewards lock.
 */
import { istDateKey, istMidnight, istParts } from './ist.js'
import { BADGE_KEYS, type BadgeKey, type BadgeSettings } from './rewards.js'

export { BADGE_KEYS, type BadgeKey }

/** One eligible booking, as the badge rules read it. */
export interface BadgeBooking {
  rootBookingId: string
  /** The slot's start: what time of day and which season the wash was. */
  startAt: Date
  /** When it was completed: what the monthly streak counts, like the stamps' streak. */
  completedAt: Date
  vendorId: string
  bookingType: 'dropin' | 'doorstep' | 'pickup'
  /** Its services' categories, a package's members included. */
  categories: readonly string[]
}

export interface BadgeFacts {
  bookings: readonly BadgeBooking[]
  /** Reviews the customer left on eligible bookings. */
  reviews: number
  /** Invites of theirs that were rewarded. */
  rewardedInvites: number
  /** Detlio Garage series they collected in full (0057); absent reads as none. */
  garageSeries?: number
}

/** The IST hour a slot starts in, 0–23. */
function istHour(at: Date): number {
  return istParts(at).hour
}

/** The longest run of consecutive IST calendar months with a booking, from "YYYY-MM" keys. */
export function longestMonthRun(months: Iterable<string>): number {
  const indexes = [...new Set(months)]
    .map((key) => {
      const [y, m] = key.split('-').map(Number)
      return y * 12 + (m - 1)
    })
    .sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < indexes.length; i += 1) {
    run = i > 0 && indexes[i] === indexes[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

/** The monsoon season: 1 June to 30 September, by the slot's IST date. */
export function inMonsoon(at: Date): boolean {
  const key = istDateKey(at).slice(5)
  return key >= '06-01' && key <= '09-30'
}

/** The most bookings in one year's monsoon. */
function monsoonBest(bookings: readonly BadgeBooking[]): number {
  const byYear = new Map<number, number>()
  for (const booking of bookings) {
    if (!inMonsoon(booking.startAt)) continue
    const year = istParts(booking.startAt).year
    byYear.set(year, (byYear.get(year) ?? 0) + 1)
  }
  return Math.max(0, ...byYear.values())
}

/** Early Bird: the slot starts before 8 am IST. */
export const EARLY_BEFORE_HOUR = 8
/** Night Owl: the slot starts at 7 pm IST or later. */
export const NIGHT_FROM_HOUR = 19

function countWhere(bookings: readonly BadgeBooking[], test: (b: BadgeBooking) => boolean): number {
  let n = 0
  for (const booking of bookings) if (test(booking)) n += 1
  return n
}

function mostAtOneGarage(bookings: readonly BadgeBooking[]): number {
  const byGarage = new Map<string, number>()
  for (const booking of bookings) byGarage.set(booking.vendorId, (byGarage.get(booking.vendorId) ?? 0) + 1)
  return Math.max(0, ...byGarage.values())
}

export interface BadgeDefinition {
  key: BadgeKey
  label: string
  /** How to earn it, shown on a locked badge. */
  howTo: string
  /** The number to reach. */
  goal: number
  /** Where the customer stands on it (uncapped). */
  measure: (facts: BadgeFacts) => number
}

/**
 * The badges, in the cabinet's order. The goals are part of each badge's
 * name ("25 Washes Club"), so they are not settings; on/off and the bonus
 * stamps are.
 */
export const BADGES: readonly BadgeDefinition[] = [
  {
    key: 'first_shine',
    label: 'First Shine',
    howTo: 'Complete your first booking through Detlio.',
    goal: 1,
    measure: (f) => f.bookings.length,
  },
  { key: 'washes_5', label: '5 Washes Club', howTo: 'Complete 5 bookings through Detlio.', goal: 5, measure: (f) => f.bookings.length },
  { key: 'washes_25', label: '25 Washes Club', howTo: 'Complete 25 bookings through Detlio.', goal: 25, measure: (f) => f.bookings.length },
  { key: 'washes_50', label: '50 Washes Club', howTo: 'Complete 50 bookings through Detlio.', goal: 50, measure: (f) => f.bookings.length },
  { key: 'washes_100', label: '100 Washes Club', howTo: 'Complete 100 bookings through Detlio.', goal: 100, measure: (f) => f.bookings.length },
  {
    key: 'streak_3',
    label: '3-Month Streak',
    howTo: 'Book in 3 calendar months in a row.',
    goal: 3,
    measure: (f) => longestMonthRun(f.bookings.map((b) => istDateKey(b.completedAt).slice(0, 7))),
  },
  {
    key: 'streak_6',
    label: '6-Month Streak',
    howTo: 'Book in 6 calendar months in a row.',
    goal: 6,
    measure: (f) => longestMonthRun(f.bookings.map((b) => istDateKey(b.completedAt).slice(0, 7))),
  },
  {
    key: 'streak_12',
    label: '12-Month Streak',
    howTo: 'Book in 12 calendar months in a row.',
    goal: 12,
    measure: (f) => longestMonthRun(f.bookings.map((b) => istDateKey(b.completedAt).slice(0, 7))),
  },
  {
    key: 'monsoon_shine',
    label: 'Monsoon Shine',
    howTo: 'Book 2 washes between 1 June and 30 September.',
    goal: 2,
    measure: (f) => monsoonBest(f.bookings),
  },
  {
    key: 'early_bird',
    label: 'Early Bird',
    howTo: 'Book 5 washes that start before 8 am.',
    goal: 5,
    measure: (f) => countWhere(f.bookings, (b) => istHour(b.startAt) < EARLY_BEFORE_HOUR),
  },
  {
    key: 'night_owl',
    label: 'Night Owl',
    howTo: 'Book 5 washes that start at 7 pm or later.',
    goal: 5,
    measure: (f) => countWhere(f.bookings, (b) => istHour(b.startAt) >= NIGHT_FROM_HOUR),
  },
  {
    key: 'explorer',
    label: 'Explorer',
    howTo: 'Book at 3 different garages.',
    goal: 3,
    measure: (f) => new Set(f.bookings.map((b) => b.vendorId)).size,
  },
  {
    key: 'loyal_regular',
    label: 'Loyal Regular',
    howTo: 'Book 10 times at the same garage.',
    goal: 10,
    measure: (f) => mostAtOneGarage(f.bookings),
  },
  {
    key: 'pickup_pro',
    label: 'Pickup Pro',
    howTo: 'Complete 3 pickup & drop bookings.',
    goal: 3,
    measure: (f) => countWhere(f.bookings, (b) => b.bookingType === 'pickup'),
  },
  {
    key: 'doorstep_devotee',
    label: 'Doorstep Devotee',
    howTo: 'Complete 5 doorstep bookings.',
    goal: 5,
    measure: (f) => countWhere(f.bookings, (b) => b.bookingType === 'doorstep'),
  },
  {
    key: 'reviewer',
    label: 'Reviewer',
    howTo: 'Review 5 of your bookings.',
    goal: 5,
    measure: (f) => f.reviews,
  },
  {
    key: 'ambassador',
    label: 'Ambassador',
    howTo: 'Invite 3 friends who book through Detlio.',
    goal: 3,
    measure: (f) => f.rewardedInvites,
  },
  {
    key: 'detailing_devotee',
    label: 'Detailing Devotee',
    howTo: 'Complete 3 detailing jobs.',
    goal: 3,
    measure: (f) => countWhere(f.bookings, (b) => b.categories.includes('detailing')),
  },
  {
    key: 'coating_club',
    label: 'Coating Club',
    howTo: 'Complete a coating job.',
    goal: 1,
    measure: (f) => countWhere(f.bookings, (b) => b.categories.includes('coating')),
  },
  {
    key: 'garage_legend',
    label: 'Garage Legend',
    howTo: 'Collect every car in a Detlio Garage series.',
    goal: 1,
    measure: (f) => f.garageSeries ?? 0,
  },
]

export function badgeDefinition(key: BadgeKey): BadgeDefinition {
  const found = BADGES.find((badge) => badge.key === key)
  if (!found) throw new Error(`unknown badge ${key}`)
  return found
}

/** Where the customer stands on one badge: done so far (capped at the goal) and the goal. */
export function badgeProgress(key: BadgeKey, facts: BadgeFacts): { current: number; goal: number } {
  const badge = badgeDefinition(key)
  return { current: Math.min(badge.goal, badge.measure(facts)), goal: badge.goal }
}

/**
 * The badges to award now: switched on, not earned yet, and reached. In
 * the cabinet's order. A badge switched off is never awarded (and is
 * awarded on the next evaluation once switched back on, if reached).
 */
export function badgesToAward(
  facts: BadgeFacts,
  earned: ReadonlySet<string>,
  settings: Record<BadgeKey, BadgeSettings>
): Array<{ key: BadgeKey; bonusStamps: number }> {
  const award: Array<{ key: BadgeKey; bonusStamps: number }> = []
  for (const badge of BADGES) {
    const setting = settings[badge.key]
    if (!setting.enabled || earned.has(badge.key)) continue
    if (badge.measure(facts) >= badge.goal) award.push({ key: badge.key, bonusStamps: setting.bonusStamps })
  }
  return award
}

/** A challenge's own badge is stored under this key, with the challenge named. */
export const CHALLENGE_BADGE_KEY = 'challenge'

/** The words of a badge's celebration, push and Updates alike. Never anything about the customer. */
export function badgeEarnedWords(label: string, bonusStamps: number): { title: string; body: string } {
  const stamps = bonusStamps === 0 ? '' : bonusStamps === 1 ? ' A bonus stamp is on your Shine Card.' : ` ${bonusStamps} bonus stamps are on your Shine Card.`
  return { title: `Badge earned: ${label}`, body: `Nice one.${stamps}` }
}

/** Celebratory pushes go out 08:00–20:59 IST; one earned at night waits for the morning's run. */
export function isCelebrationHour(now: Date): boolean {
  const hour = istParts(now).hour
  return hour >= 8 && hour < 21
}

/** The nightly badge pass starts its day at 02:00 IST: each customer is checked once a day from then. */
export const BADGE_CHECK_DAY_STARTS_HOUR = 2

/** The moment today's nightly pass began (02:00 IST today, or yesterday's before 02:00). */
export function badgeCheckDayStart(now: Date): Date {
  const start = new Date(istMidnight(istDateKey(now)).getTime() + BADGE_CHECK_DAY_STARTS_HOUR * 3_600_000)
  return istParts(now).hour >= BADGE_CHECK_DAY_STARTS_HOUR ? start : new Date(start.getTime() - 24 * 3_600_000)
}
