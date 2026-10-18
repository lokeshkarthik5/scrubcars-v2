/**
 * Achievements (0054) for the apps: the badges' names, how each is earned,
 * the goal, and the defaults the team can change in admin. The twin of
 * apps/server/src/lib/achievements.ts and the achievements part of
 * lib/rewards.ts (achievements.parity.test.ts): the API decides who earned
 * what; these are the words and numbers the screens show before it answers.
 */

export const BADGE_KEYS = [
  'first_shine',
  'washes_5',
  'washes_25',
  'washes_50',
  'washes_100',
  'streak_3',
  'streak_6',
  'streak_12',
  'monsoon_shine',
  'early_bird',
  'night_owl',
  'explorer',
  'loyal_regular',
  'pickup_pro',
  'doorstep_devotee',
  'reviewer',
  'ambassador',
  'detailing_devotee',
  'coating_club',
] as const
export type BadgeKey = (typeof BADGE_KEYS)[number]

export interface BadgeSettings {
  enabled: boolean
  bonusStamps: number
}

export const DEFAULT_ACHIEVEMENT_SETTINGS: Record<BadgeKey, BadgeSettings> = {
  first_shine: { enabled: true, bonusStamps: 1 },
  washes_5: { enabled: true, bonusStamps: 1 },
  washes_25: { enabled: true, bonusStamps: 2 },
  washes_50: { enabled: true, bonusStamps: 3 },
  washes_100: { enabled: true, bonusStamps: 5 },
  streak_3: { enabled: true, bonusStamps: 0 },
  streak_6: { enabled: true, bonusStamps: 1 },
  streak_12: { enabled: true, bonusStamps: 2 },
  monsoon_shine: { enabled: true, bonusStamps: 1 },
  early_bird: { enabled: true, bonusStamps: 1 },
  night_owl: { enabled: true, bonusStamps: 1 },
  explorer: { enabled: true, bonusStamps: 1 },
  loyal_regular: { enabled: true, bonusStamps: 1 },
  pickup_pro: { enabled: true, bonusStamps: 1 },
  doorstep_devotee: { enabled: true, bonusStamps: 1 },
  reviewer: { enabled: true, bonusStamps: 1 },
  ambassador: { enabled: true, bonusStamps: 1 },
  detailing_devotee: { enabled: true, bonusStamps: 1 },
  coating_club: { enabled: true, bonusStamps: 1 },
}

/** Bonus stamps a badge can give, as the API holds them. */
export const BADGE_BONUS_LIMITS = { min: 0, max: 5 } as const

export interface BadgeInfo {
  key: BadgeKey
  label: string
  howTo: string
  goal: number
}

/** The cabinet, in order. */
export const BADGE_CATALOG: readonly BadgeInfo[] = [
  { key: 'first_shine', label: 'First Shine', howTo: 'Complete your first booking through Detlio.', goal: 1 },
  { key: 'washes_5', label: '5 Washes Club', howTo: 'Complete 5 bookings through Detlio.', goal: 5 },
  { key: 'washes_25', label: '25 Washes Club', howTo: 'Complete 25 bookings through Detlio.', goal: 25 },
  { key: 'washes_50', label: '50 Washes Club', howTo: 'Complete 50 bookings through Detlio.', goal: 50 },
  { key: 'washes_100', label: '100 Washes Club', howTo: 'Complete 100 bookings through Detlio.', goal: 100 },
  { key: 'streak_3', label: '3-Month Streak', howTo: 'Book in 3 calendar months in a row.', goal: 3 },
  { key: 'streak_6', label: '6-Month Streak', howTo: 'Book in 6 calendar months in a row.', goal: 6 },
  { key: 'streak_12', label: '12-Month Streak', howTo: 'Book in 12 calendar months in a row.', goal: 12 },
  { key: 'monsoon_shine', label: 'Monsoon Shine', howTo: 'Book 2 washes between 1 June and 30 September.', goal: 2 },
  { key: 'early_bird', label: 'Early Bird', howTo: 'Book 5 washes that start before 8 am.', goal: 5 },
  { key: 'night_owl', label: 'Night Owl', howTo: 'Book 5 washes that start at 7 pm or later.', goal: 5 },
  { key: 'explorer', label: 'Explorer', howTo: 'Book at 3 different garages.', goal: 3 },
  { key: 'loyal_regular', label: 'Loyal Regular', howTo: 'Book 10 times at the same garage.', goal: 10 },
  { key: 'pickup_pro', label: 'Pickup Pro', howTo: 'Complete 3 pickup & drop bookings.', goal: 3 },
  { key: 'doorstep_devotee', label: 'Doorstep Devotee', howTo: 'Complete 5 doorstep bookings.', goal: 5 },
  { key: 'reviewer', label: 'Reviewer', howTo: 'Review 5 of your bookings.', goal: 5 },
  { key: 'ambassador', label: 'Ambassador', howTo: 'Invite 3 friends who book through Detlio.', goal: 3 },
  { key: 'detailing_devotee', label: 'Detailing Devotee', howTo: 'Complete 3 detailing jobs.', goal: 3 },
  { key: 'coating_club', label: 'Coating Club', howTo: 'Complete a coating job.', goal: 1 },
]

/** The badges as the settings say: stored values over the defaults. */
export function achievementSettings(settings: { achievements?: Partial<Record<BadgeKey, BadgeSettings>> } | null | undefined): Record<BadgeKey, BadgeSettings> {
  const stored = settings?.achievements ?? {}
  return Object.fromEntries(BADGE_KEYS.map((key) => [key, { ...DEFAULT_ACHIEVEMENT_SETTINGS[key], ...(stored[key] ?? {}) }])) as Record<
    BadgeKey,
    BadgeSettings
  >
}

/** "A bonus stamp", "2 bonus stamps", or nothing. */
export function bonusStampsLine(n: number): string | null {
  if (n <= 0) return null
  return n === 1 ? 'A bonus stamp' : `${n} bonus stamps`
}

/** "3 of 5" for a locked badge. */
export function badgeProgressLine(progress: { current: number; goal: number }): string {
  return `${Math.min(progress.current, progress.goal)} of ${progress.goal}`
}
