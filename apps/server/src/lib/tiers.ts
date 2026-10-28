/**
 * Bronze / Silver / Gold (owner, 29 Oct 2026): the tiers that replace the
 * "Documents verified" shield and the "Detlio Certified" seal. Pure,
 * unit-tested (tiers.test.ts). modules/tiers and the nightly run in
 * modules/certification read the numbers and store the outcome; every
 * decision is here:
 *
 *   - **Bronze**: the garage accepted the latest Detlio garage agreement, or
 *     accepted an earlier one and the latest came out under 30 days ago
 *     (lib/agreements.ts `agreementStanding`). Worked out on read, never
 *     stored; SQL twin BRONZE_GARAGE (vendors.predicates.ts).
 *   - **Silver**: Bronze, documents checked (shop photo, owner ID, bank
 *     proof; lib/vendor-documents.ts), 4.2★ or more from 5+ reviews, 10+
 *     completed jobs in 90 days, 85%+ answered in time, no garage no-shows in
 *     90 days. Given and taken by the nightly run (`planSilver`), stored in
 *     vendor_tier_standings; SQL twin SILVER_GARAGE.
 *   - **Gold**: Detlio Certified (0048), renamed: Silver plus the stricter
 *     standards in CERTIFICATION_RULES, a passing Detlio quality check, and
 *     an admin pressing Award Gold. SQL twin CERTIFIED_GARAGE.
 *   - **Losing a tier**: 14 days short before it goes (Silver here, Gold in
 *     lib/certification.ts); a new agreement version gives 30 days to accept.
 *   - **Customers** see only the highest tier the garage holds that is
 *     switched on (admin Settings → Tiers), and nothing while admin has hidden
 *     the garage's medal (`shownTier`). Garages always see their own tier.
 *
 * Every number is in TIER_RULES (Gold's in CERTIFICATION_RULES, which it
 * holds). The words and the same numbers are twinned in
 * packages/core/src/tiers.ts (tiers.parity.test.ts).
 */
import type { AgreementStanding } from './agreements.js'
import {
  CERTIFICATION_RULES,
  PHOTO_COMPLIANCE_NOT_MEASURED,
  type CertificationMetrics,
  type QualityCheckStatus,
} from './certification.js'
import { addDays, daysBetween, istDateKey } from './ist.js'

// ─── The tiers ───────────────────────────────────────────────────────────────

export const TIERS = ['bronze', 'silver', 'gold'] as const
export type Tier = (typeof TIERS)[number]

export const TIER_LABELS: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
}

const LEVEL: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3 }

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value)
}

/**
 * Every threshold, in one place. Change a number here and in
 * packages/core/src/tiers.ts together; the parity test fails otherwise.
 * Gold is CERTIFICATION_RULES itself (its own parity test).
 */
export const TIER_RULES = {
  bronze: {
    /** Days a garage that accepted an earlier version keeps Bronze after a new one. */
    agreementGraceDays: 30,
  },
  silver: {
    /** The window the measured standards look back over (the same as Gold's). */
    windowDays: CERTIFICATION_RULES.windowDays,
    minRating: 4.2,
    minReviews: 5,
    minCompleted: 10,
    minResponseRate: 0.85,
    maxGarageNoShows: 0,
  },
  gold: CERTIFICATION_RULES,
  /** Days a garage may fall short before it loses Silver or Gold. */
  graceDays: CERTIFICATION_RULES.graceDays,
} as const

// ─── What customers see ──────────────────────────────────────────────────────

/** Admin's per-tier switch: whether customers see that tier's medal. */
export type TierSwitches = Record<Tier, boolean>

/** A tier with no row is shown: the migration seeds all three on. */
export const DEFAULT_TIER_SWITCHES: TierSwitches = { bronze: true, silver: true, gold: true }

/**
 * Holds Silver: the nightly run gave it and has not taken it away. The SQL
 * twin is SILVER_GARAGE (modules/vendors/vendors.predicates.ts), pinned by
 * its test.
 */
export function holdsSilver(row: { silverAt: Date | string | null } | null | undefined): boolean {
  return row != null && row.silverAt != null
}

/** What a garage holds of each tier: Gold if certified, Silver if held, Bronze if on the agreement. */
export interface TierHoldings {
  gold: boolean
  silver: boolean
  bronze: boolean
}

/** The highest tier a garage holds. */
export function heldTier(held: TierHoldings): Tier | null {
  if (held.gold) return 'gold'
  if (held.silver) return 'silver'
  if (held.bronze) return 'bronze'
  return null
}

/**
 * The medal customers see: the highest tier the garage actually holds that
 * is switched on (a Gold garage shows Silver while Gold is off, since Gold
 * comes with Silver), and none while admin has hidden this garage's medal.
 * Bronze is shown only on the agreement itself: a Gold or Silver garage that
 * has not accepted it (during its 14 days, or before any agreement exists)
 * never steps down to a Bronze medal that would claim it had.
 */
export function shownTier(held: TierHoldings, switches: TierSwitches, hidden: boolean): Tier | null {
  if (hidden) return null
  const holds: Record<Tier, boolean> = {
    gold: held.gold,
    silver: held.silver || held.gold,
    bronze: held.bronze,
  }
  for (const tier of [...TIERS].reverse()) {
    if (holds[tier] && switches[tier]) return tier
  }
  return null
}

/** The tiers a "Silver & above" filter lets through, as switched on. */
export function silverAndAboveTiers(switches: TierSwitches): Array<'silver' | 'gold'> {
  return (['silver', 'gold'] as const).filter((tier) => switches[tier])
}

/** "Silver & above" is offered only while Silver or Gold is shown. */
export function silverFilterOffered(switches: TierSwitches): boolean {
  return silverAndAboveTiers(switches).length > 0
}

// ─── The steps ───────────────────────────────────────────────────────────────

export const TIER_STEP_KEYS = [
  'agreement',
  'documents',
  'rating',
  'completed',
  'response',
  'no_shows',
  'complaints',
  'photos',
  'bypass',
  'quality_check',
] as const
export type TierStepKey = (typeof TIER_STEP_KEYS)[number]

/** Where the garage can act on a step in its portal, if anywhere. */
export type TierStepAction = 'agreement' | 'documents' | null

/** One step towards a tier, as the garage's portal and admin show it. */
export interface TierStep {
  key: TierStepKey
  label: string
  met: boolean
  /** False when there was nothing to measure yet (it then passes). */
  measured: boolean
  /** "4.6 from 23 reviews", "92% (23 of 25)". */
  value: string
  /** "4.2 or more, at least 5 reviews". */
  target: string
  action: TierStepAction
}

const percent = (share: number) => `${Math.round(share * 1000) / 10}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The agreement step: Bronze's only one, and the first of every tier above while missing. */
export function agreementStep(agreement: AgreementStanding): TierStep {
  const value =
    agreement.status === 'not_published'
      ? 'Detlio has not published it yet'
      : agreement.status === 'accepted'
        ? `Accepted version ${agreement.acceptedVersion}`
        : agreement.status === 'grace'
          ? `Version ${agreement.latestVersion} to accept by ${agreement.acceptBy}`
          : agreement.acceptedVersion === null
            ? 'Not accepted yet'
            : `Version ${agreement.latestVersion} not accepted`
  return {
    key: 'agreement',
    label: 'Accept the Detlio garage agreement',
    // In the 30 days the garage keeps Bronze, but the step is still to do.
    met: agreement.status === 'accepted',
    measured: agreement.status !== 'not_published',
    value,
    target: agreement.latestVersion === null ? 'The latest version' : `Version ${agreement.latestVersion}`,
    action: agreement.status === 'not_published' ? null : 'agreement',
  }
}

/** Response in time as a step, at `minRate`. Nothing to measure passes. */
function responseStep(metrics: CertificationMetrics, minRate: number): TierStep {
  const considered = metrics.responses.inTime + metrics.responses.missed
  const target = `At least ${percent(minRate)}`
  if (considered === 0) {
    return {
      key: 'response',
      label: 'Answer bookings in time (90 days)',
      met: true,
      measured: false,
      value: 'No bookings with a deadline yet',
      target,
      action: null,
    }
  }
  const rate = metrics.responses.inTime / considered
  return {
    key: 'response',
    label: 'Answer bookings in time (90 days)',
    met: rate >= minRate,
    measured: true,
    value: `${percent(rate)} (${metrics.responses.inTime} of ${considered})`,
    target,
    action: null,
  }
}

function ratingStep(metrics: CertificationMetrics, minRating: number, minReviews: number): TierStep {
  return {
    key: 'rating',
    label: 'Rating',
    met: metrics.rating !== null && metrics.rating >= minRating && metrics.reviewCount >= minReviews,
    measured: true,
    value:
      metrics.rating === null
        ? 'No reviews yet'
        : `${metrics.rating.toFixed(1)} from ${plural(metrics.reviewCount, 'review')}`,
    target: `${minRating} or more, at least ${minReviews} reviews`,
    action: null,
  }
}

function completedStep(metrics: CertificationMetrics, minCompleted: number): TierStep {
  return {
    key: 'completed',
    label: 'Jobs completed (90 days)',
    met: metrics.completed >= minCompleted,
    measured: true,
    value: String(metrics.completed),
    target: `At least ${minCompleted}`,
    action: null,
  }
}

function noShowsStep(metrics: CertificationMetrics, max: number): TierStep {
  return {
    key: 'no_shows',
    label: 'No missed bookings (90 days)',
    met: metrics.garageNoShows <= max,
    measured: true,
    value: metrics.garageNoShows === 0 ? 'None' : String(metrics.garageNoShows),
    target: max === 0 ? 'None' : `At most ${max}`,
    action: null,
  }
}

/**
 * Silver's own steps (Bronze's agreement comes first when missing): documents
 * checked, rating, completed jobs, answered in time, no missed bookings.
 */
export function silverSteps(metrics: CertificationMetrics): TierStep[] {
  const R = TIER_RULES.silver
  return [
    {
      key: 'documents',
      label: 'Documents checked by Detlio',
      met: metrics.documentsVerified === true,
      measured: metrics.documentsVerified !== null,
      value:
        metrics.documentsVerified === null
          ? 'Not open yet'
          : metrics.documentsVerified
            ? 'Shop photo, ID and bank proof approved'
            : 'Not all approved yet',
      target: 'Shop photo, owner ID and bank proof approved',
      action: metrics.documentsVerified === null ? null : 'documents',
    },
    ratingStep(metrics, R.minRating, R.minReviews),
    completedStep(metrics, R.minCompleted),
    responseStep(metrics, R.minResponseRate),
    noShowsStep(metrics, R.maxGarageNoShows),
  ]
}

/**
 * Gold's own steps beyond Silver: today's Detlio Certified standards that
 * are stricter than Silver's, the ones Silver does not have, and Detlio's
 * quality check. Award Gold itself is admin's press, not a step.
 */
export function goldSteps(
  metrics: CertificationMetrics,
  check: { valid: boolean; status: QualityCheckStatus }
): TierStep[] {
  const G = TIER_RULES.gold
  const steps: TierStep[] = [
    ratingStep(metrics, G.minRating, G.minReviews),
    completedStep(metrics, G.minCompleted),
    responseStep(metrics, G.minResponseRate),
  ]

  if (metrics.completed === 0) {
    steps.push({
      key: 'complaints',
      label: 'Few complaints (90 days)',
      met: metrics.complaints === 0,
      measured: metrics.complaints > 0,
      value: plural(metrics.complaints, 'complaint'),
      target: `Under ${percent(G.maxComplaintRate)} of jobs`,
      action: null,
    })
  } else {
    const rate = metrics.complaints / metrics.completed
    steps.push({
      key: 'complaints',
      label: 'Few complaints (90 days)',
      met: rate < G.maxComplaintRate,
      measured: true,
      value: `${percent(rate)} (${plural(metrics.complaints, 'complaint')})`,
      target: `Under ${percent(G.maxComplaintRate)} of jobs`,
      action: null,
    })
  }

  const photos = metrics.photoCompliance ?? PHOTO_COMPLIANCE_NOT_MEASURED
  const photoTarget = `At least ${percent(G.minPhotoCompliance)} of jobs`
  if (!photos.measured || photos.rate === null) {
    steps.push({
      key: 'photos',
      label: 'Before and after photos (90 days)',
      met: true,
      measured: false,
      value: photos.measured ? 'No jobs to measure yet' : 'Not measured yet',
      target: photoTarget,
      action: null,
    })
  } else {
    steps.push({
      key: 'photos',
      label: 'Before and after photos (90 days)',
      met: photos.rate >= G.minPhotoCompliance,
      measured: true,
      value: `${percent(photos.rate)} of ${plural(photos.jobs, 'job')}`,
      target: photoTarget,
      action: null,
    })
  }

  const strikes = metrics.bypassStrikes ?? 0
  steps.push({
    key: 'bypass',
    label: `Never asks customers to book outside Detlio (${G.bypassWindowDays} days)`,
    met: strikes <= G.maxBypassStrikes,
    measured: true,
    value: strikes === 0 ? 'None confirmed' : `${strikes} confirmed`,
    target: G.maxBypassStrikes === 0 ? 'None confirmed' : `At most ${G.maxBypassStrikes}`,
    action: null,
  })

  steps.push({
    key: 'quality_check',
    label: 'Passed a Detlio quality check',
    met: check.valid,
    measured: true,
    value:
      check.status === 'passed'
        ? 'Passed'
        : check.status === 'failed'
          ? 'Did not pass'
          : check.status === 'expired'
            ? 'Over 6 months ago'
            : 'Not yet',
    target: `In the last ${G.qualityCheckMonths} months`,
    action: null,
  })
  return steps
}

// ─── Progress ────────────────────────────────────────────────────────────────

export interface TierInput {
  agreement: AgreementStanding
  metrics: CertificationMetrics
  check: { valid: boolean; status: QualityCheckStatus }
  /** Stored: holds Silver (vendor_tier_standings.silver_at). */
  silverHeld: boolean
  /** Stored: Detlio Certified (vendor_certifications). */
  goldHeld: boolean
}

export interface TierProgress {
  /** The highest tier held now. */
  tier: Tier | null
  /** Meets everything Silver asks for tonight (Bronze included). */
  silverEligible: boolean
  /** The next tier up, and what it takes; null at Gold. */
  next: { tier: Tier; steps: TierStep[]; done: number; total: number } | null
  /**
   * What the tier held now asks for that is not met (the agreement first):
   * a Silver or Gold garage falling short sees exactly what to put right.
   * Empty when everything holds, and for Bronze (its one step is the
   * agreement, whose 30 days Home's banner tells).
   */
  keep: TierStep[]
}

/**
 * Where a garage stands and what the next tier takes: the steps the garage
 * sees on its "Your tier" card and admin on the garage page. A tier above
 * Bronze lists the agreement first while it is not accepted, since every
 * tier needs Bronze.
 */
export function tierProgress(input: TierInput): TierProgress {
  const bronze = input.agreement.bronze
  const tier = heldTier({ gold: input.goldHeld, silver: input.silverHeld, bronze })
  const silver = silverSteps(input.metrics)
  const silverEligible = bronze && silver.every((step) => step.met)
  const agreement = agreementStep(input.agreement)

  const gold = goldSteps(input.metrics, input.check)
  // Gold asks for everything Silver does: its stricter versions of rating,
  // jobs and answers, plus Silver's documents and no missed bookings.
  const silverOnly = silver.filter((step) => step.key === 'documents' || step.key === 'no_shows')
  const goldAll = [...silverOnly, ...gold]

  let next: TierProgress['next'] = null
  const withAgreement = (steps: TierStep[]) => (agreement.met ? steps : [agreement, ...steps])
  if (tier === null) {
    next = { tier: 'bronze', steps: [agreement], done: 0, total: 0 }
  } else if (tier === 'bronze') {
    next = { tier: 'silver', steps: withAgreement(silver), done: 0, total: 0 }
  } else if (tier === 'silver') {
    next = { tier: 'gold', steps: withAgreement(goldAll), done: 0, total: 0 }
  }
  if (next) {
    next.done = next.steps.filter((step) => step.met).length
    next.total = next.steps.length
  }

  const keepOf = (steps: TierStep[]) => withAgreement(steps).filter((step) => !step.met)
  const keep = tier === 'gold' ? keepOf(goldAll) : tier === 'silver' ? keepOf(silver) : []
  return { tier, silverEligible, next, keep }
}

/** "You're Bronze. Next: Silver, 3 of 5 done." */
export function progressLine(progress: TierProgress): string {
  const now = progress.tier ? `You're ${TIER_LABELS[progress.tier]}.` : 'No tier yet.'
  if (!progress.next) return `${now} That's the top tier.`
  return `${now} Next: ${TIER_LABELS[progress.next.tier]}, ${progress.next.done} of ${progress.next.total} done.`
}

// ─── Silver, nightly ─────────────────────────────────────────────────────────

export interface SilverState {
  silverAt: Date | null
  shortSince: Date | null
}

export type SilverEvent = 'gained' | 'at_risk' | 'lost'

export interface SilverPlan {
  silverAt: Date | null
  shortSince: Date | null
  /** Set when Silver ends tonight. */
  lostAt: Date | null
  event: SilverEvent | null
  /** IST days it has fallen short, while holding Silver; 0 otherwise. */
  daysShort: number
}

/**
 * One garage's Silver tonight. Holding it and eligible: it stands (any 14
 * days cleared). Holding it and short: the 14 days start (at risk), and on
 * the 14th IST day it goes. Not holding it and eligible: it is given now.
 */
export function planSilver(state: SilverState, eligible: boolean, now: Date): SilverPlan {
  if (state.silverAt) {
    if (eligible) {
      return { silverAt: state.silverAt, shortSince: null, lostAt: null, event: null, daysShort: 0 }
    }
    const since = state.shortSince ?? now
    const daysShort = Math.max(0, daysBetween(istDateKey(since), istDateKey(now)))
    if (daysShort >= TIER_RULES.graceDays) {
      return { silverAt: null, shortSince: null, lostAt: now, event: 'lost', daysShort }
    }
    return {
      silverAt: state.silverAt,
      shortSince: since,
      lostAt: null,
      event: state.shortSince ? null : 'at_risk',
      daysShort,
    }
  }
  if (eligible) return { silverAt: now, shortSince: null, lostAt: null, event: 'gained', daysShort: 0 }
  return { silverAt: null, shortSince: null, lostAt: null, event: null, daysShort: 0 }
}

/** The last IST day a garage short since `since` keeps its tier. */
export function tierGraceEndsOn(since: Date): string {
  return addDays(istDateKey(since), TIER_RULES.graceDays - 1)
}

/**
 * Why the nightly run changes no tier tonight, or null. While garage
 * documents are off nobody can meet Silver; before admin publishes the first
 * agreement nobody can hold Bronze. Either way every garage would fall
 * short, so nothing is given or taken (and, pre-launch, nothing customers
 * see disappears because a setting is not done yet).
 */
export function tierRunPaused(input: { documentsOn: boolean; agreementPublished: boolean }):
  | 'documents_off'
  | 'no_agreement'
  | null {
  if (!input.documentsOn) return 'documents_off'
  if (!input.agreementPublished) return 'no_agreement'
  return null
}

// ─── The snapshot ────────────────────────────────────────────────────────────

/** What vendor_tier_standings.evaluation stores: the last night's checklist. */
export interface TierSnapshot {
  version: 1
  evaluatedAt: string
  bronze: boolean
  silverEligible: boolean
  steps: TierStep[]
}

export function toTierSnapshot(
  agreement: AgreementStanding,
  metrics: CertificationMetrics,
  now: Date
): TierSnapshot {
  const steps = [agreementStep(agreement), ...silverSteps(metrics)]
  return {
    version: 1,
    evaluatedAt: now.toISOString(),
    bronze: agreement.bronze,
    silverEligible: agreement.bronze && steps.slice(1).every((step) => step.met),
    steps,
  }
}
