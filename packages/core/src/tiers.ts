/**
 * Bronze / Silver / Gold for the apps (0063): the medals' words, what each
 * tier means in plain words for customers, the garage's progress line, and
 * the numbers behind them. The rules are the server's
 * (apps/server/src/lib/tiers.ts, TIER_RULES; Gold's numbers are
 * CERTIFICATION_THRESHOLDS in ./certification.ts); these are the words and
 * numbers the customer app, the garage portal and admin show, kept equal to
 * the server's by its tiers.parity.test.ts.
 *
 * No imports: the server's parity test loads this file by path.
 */

export const TIERS = ['bronze', 'silver', 'gold'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABELS: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
}

/** The same numbers as the server's TIER_RULES (parity test). */
export const TIER_THRESHOLDS = {
  agreementGraceDays: 30,
  graceDays: 14,
  silver: {
    windowDays: 90,
    minRating: 4.2,
    minReviews: 5,
    minCompleted: 10,
    minResponseRate: 0.85,
    maxGarageNoShows: 0,
  },
  /** Gold's numbers that customers read (the server's CERTIFICATION_RULES). */
  gold: {
    windowDays: 90,
    minRating: 4.5,
    minReviews: 10,
    minCompleted: 20,
    minResponseRate: 0.9,
    maxComplaintRate: 0.03,
    minPhotoCompliance: 0.9,
    bypassWindowDays: 180,
    qualityCheckMonths: 6,
  },
} as const

const GOLD = TIER_THRESHOLDS.gold

/** The medal's name, as a screen reader and a tooltip say it: "Gold garage". */
export function tierMedalName(tier: Tier): string {
  return `${TIER_LABELS[tier]} garage`
}

/** The garage page's one line under the medal. */
export const TIER_NOTES: Record<Tier, string> = {
  bronze: 'Has accepted the Detlio garage agreement.',
  silver: 'Documents checked by Detlio, well rated and reliable.',
  gold: 'Detlio’s highest standards, checked in person.',
}

const S = TIER_THRESHOLDS.silver
const pct = (share: number) => Math.round(share * 100)

/**
 * "What this means": each tier's own standards in plain words; a tier
 * also meets every one below it (the sheet lists them all). Every line is
 * one the server checks: a medal must never claim what nobody checked.
 */
export const TIER_STANDARDS: Record<Tier, readonly string[]> = {
  bronze: ['Has accepted the Detlio garage agreement.'],
  silver: [
    'Detlio has checked the owner’s ID, bank details and shop.',
    `Rated ${S.minRating} or more by at least ${S.minReviews} customers.`,
    `At least ${S.minCompleted} jobs completed through Detlio in the last ${S.windowDays} days.`,
    `Answers at least ${pct(S.minResponseRate)}% of bookings in time.`,
    `Has not missed a booking in the last ${S.windowDays} days.`,
  ],
  gold: [
    `Rated ${GOLD.minRating} or more by at least ${GOLD.minReviews} customers.`,
    `At least ${GOLD.minCompleted} jobs completed through Detlio in the last ${GOLD.windowDays} days.`,
    `Answers at least ${pct(GOLD.minResponseRate)}% of bookings in time.`,
    `Complaints about damage, poor work or not turning up on fewer than ${pct(GOLD.maxComplaintRate)} in 100 jobs.`,
    `Takes before and after photos of the car on at least ${pct(GOLD.minPhotoCompliance)}% of jobs.`,
    `Has not been found asking customers to book or pay outside Detlio in the last ${GOLD.bypassWindowDays} days.`,
    `Visited and checked in person by Detlio in the last ${GOLD.qualityCheckMonths} months.`,
  ],
}

/** Every line a tier stands for: its own and the ones below it, the top tier's first. */
export function tierStandards(tier: Tier): { tier: Tier; lines: readonly string[] }[] {
  const upTo = TIERS.slice(0, TIERS.indexOf(tier) + 1)
  return [...upTo].reverse().map((t) => ({ tier: t, lines: TIER_STANDARDS[t] }))
}

/** The sheet's last line: how a medal is kept. */
export const TIER_KEPT_LINE = `Detlio checks these every day. A garage that stops meeting them loses its medal after ${TIER_THRESHOLDS.graceDays} days.`

/** The customer list's filter chip. */
export const SILVER_FILTER_LABEL = 'Silver & above'

// ─── The garage's own ────────────────────────────────────────────────────────

/** "You're Bronze. Next: Silver, 3 of 5 done." (the server's progressLine, word for word). */
export function progressLine(progress: {
  tier: Tier | null
  next: { tier: Tier; done: number; total: number } | null
}): string {
  const now = progress.tier ? `You're ${TIER_LABELS[progress.tier]}.` : 'No tier yet.'
  if (!progress.next) return `${now} That's the top tier.`
  return `${now} Next: ${TIER_LABELS[progress.next.tier]}, ${progress.next.done} of ${progress.next.total} done.`
}

/** What each tier brings a garage, under the progress line. */
export const TIER_GARAGE_LINES: Record<Tier, string> = {
  bronze: 'Bronze shows customers you have agreed to Detlio’s terms.',
  silver: 'Silver garages show up under “Silver & above”, which customers use to pick a garage.',
  gold: 'Gold is Detlio’s highest tier: customers see it first.',
}

/** Where a step can be acted on in the portal. */
export type TierStepAction = 'agreement' | 'documents' | null

export const TIER_STEP_LINKS: Record<Exclude<TierStepAction, null>, { href: string; label: string }> = {
  agreement: { href: '/agreement', label: 'Read and accept' },
  documents: { href: '/settings/documents', label: 'Upload documents' },
}
