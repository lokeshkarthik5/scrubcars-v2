/**
 * Detlio Certified (0048): a quality badge a garage earns by meeting
 * measurable standards and passing an in-person check by Detlio.
 *
 * Pure, unit-tested (certification.test.ts). The module
 * (modules/certification) reads the numbers and writes the outcome; every
 * decision is here:
 *
 *   - **Eligible**: the garage meets every standard in CERTIFICATION_RULES
 *     over the last 90 IST days, Test-marked bookings left out
 *     (`evaluateEligibility`).
 *   - **Detlio confirms**: a quality check (mystery visit or inspection)
 *     recorded by admin; the latest one in the last 6 months must be a pass
 *     (`qualityCheckStanding`).
 *   - **Certified**: an admin pressed Certify on an eligible garage with a
 *     passing check, and it has not been revoked or lost since
 *     (`isCertified`, SQL twin CERTIFIED_GARAGE in vendors.predicates.ts).
 *   - **Nightly**: a certified garage that stops meeting the standards (or
 *     whose check runs out or fails) has 14 days to put it right before it
 *     loses the badge on its own (`planEvaluation`).
 *
 * The numbers live in one object, CERTIFICATION_RULES. The customer words
 * and the same numbers are twinned in packages/core/src/certification.ts
 * (certification.parity.test.ts).
 */
import { addDays, daysBetween, istDateKey, istMidnight } from './ist.js'
import type { PhotoCompliance as PhotoComplianceFigure } from './photo-compliance.js'

// ─── The standards ───────────────────────────────────────────────────────────

/**
 * Every threshold, in one place (owner's sensible defaults, 18 Oct 2026).
 * Change a number here and in packages/core/src/certification.ts together;
 * the parity test fails otherwise.
 */
export const CERTIFICATION_RULES = {
  /** The window the measured standards look back over, in IST days, today included. */
  windowDays: 90,
  /** Average rating, all-time reviews (Test-marked bookings' left out). */
  minRating: 4.5,
  minReviews: 10,
  /** Completed bookings in the window. */
  minCompleted: 20,
  /**
   * Share of paid bookings with a deadline (0042) that the garage answered in
   * time: accepted by `respond_by`, declined, or a time suggested. A miss is
   * `response_missed_at` (cancelled for not accepting in time) or an accept
   * after the deadline while the switch was off. Declines never count against.
   */
  minResponseRate: 0.9,
  /**
   * Complaints about damage, the quality of the work or the garage not
   * turning up, as a share of completed bookings: strictly below this.
   */
  maxComplaintRate: 0.03,
  complaintCategories: ['damage', 'service_quality', 'garage_no_show'] as const,
  /** Garage no-shows recorded in the window: none at all. */
  maxGarageNoShows: 0,
  /**
   * Before/after job photos (0045): share of the last 90 days' completed
   * jobs with 2 before and 2 after photos of the garage's own, as
   * lib/photo-compliance.ts grades it (waived and Test jobs left out).
   */
  minPhotoCompliance: 0.9,
  /** A passing quality check counts for this many months. */
  qualityCheckMonths: 6,
  /** Days a certified garage may fall short before it loses the badge. */
  graceDays: 14,
  /** "Became eligible" is told to ops at most this often per garage. */
  eligibleAlertCooldownDays: 14,
} as const

export type CertificationComplaintCategory = (typeof CERTIFICATION_RULES.complaintCategories)[number]

/**
 * Before/after photo compliance (0045), as the evaluation reads it: the
 * figure lib/photo-compliance.ts computes (`fromPhotoCompliance`), read in
 * `photoComplianceByGarage` in modules/certification/certification.service.ts,
 * the one place this module reads it. `PHOTO_COMPLIANCE_NOT_MEASURED` (passes)
 * is only the default for metrics that leave it out.
 */
export type PhotoCompliance =
  | { measured: false }
  | {
      measured: true
      /** 0–1 over the window's completed jobs; null with no jobs to measure. */
      rate: number | null
      jobs: number
    }

export const PHOTO_COMPLIANCE_NOT_MEASURED: PhotoCompliance = { measured: false }

/**
 * lib/photo-compliance.ts's figure as a rate: its whole percent (rounded
 * down, so the checklist says the same number as admin's garage card and
 * 89.9% never reads 90%), null with no jobs to grade.
 */
export function fromPhotoCompliance(figure: PhotoComplianceFigure): PhotoCompliance {
  return {
    measured: true,
    rate: figure.percent === null ? null : figure.percent / 100,
    jobs: figure.jobs,
  }
}

/** What the evaluation reads about one garage. */
export interface CertificationMetrics {
  /**
   * Every required document approved (lib/vendor-documents.ts). Null while
   * garage documents are off (no R2_DOCS_BUCKET): nobody can meet it then.
   */
  documentsVerified: boolean | null
  /** All-time average, null with no reviews. */
  rating: number | null
  reviewCount: number
  completed: number
  /** Paid bookings with a deadline whose answer is known. */
  responses: { inTime: number; missed: number }
  /** Complaints in CERTIFICATION_RULES.complaintCategories, one per booking. */
  complaints: number
  garageNoShows: number
  /** lib/photo-compliance.ts's figure (`fromPhotoCompliance`); left out, not measured (passes). */
  photoCompliance?: PhotoCompliance
}

export const RULE_KEYS = [
  'documents',
  'rating',
  'completed',
  'response',
  'complaints',
  'no_shows',
  'photos',
] as const
export type RuleKey = (typeof RULE_KEYS)[number]

/** One line of the checklist, as admin and the garage's portal show it. */
export interface RuleResult {
  key: RuleKey
  label: string
  met: boolean
  /** False when there was nothing to measure (it then passes). */
  measured: boolean
  /** "4.6 from 23 reviews", "92% (23 of 25)". */
  value: string
  /** "4.5 or more, at least 10 reviews". */
  target: string
}

export interface Eligibility {
  eligible: boolean
  rules: RuleResult[]
}

export const RULE_LABELS: Record<RuleKey, string> = {
  documents: 'Documents verified',
  rating: 'Rating',
  completed: 'Completed bookings (90 days)',
  response: 'Answered in time (90 days)',
  complaints: 'Complaints (90 days)',
  no_shows: 'Garage no-shows (90 days)',
  photos: 'Before and after photos (90 days)',
}

const percent = (share: number) => `${Math.round(share * 1000) / 10}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Every standard, measured. Eligible is every one met; one with nothing to
 * measure (no booking with a deadline yet; no completed job to grade for
 * photos) passes and says so.
 */
export function evaluateEligibility(metrics: CertificationMetrics): Eligibility {
  const R = CERTIFICATION_RULES
  const rules: RuleResult[] = []
  const add = (key: RuleKey, met: boolean, value: string, target: string, measured = true) =>
    rules.push({ key, label: RULE_LABELS[key], met, measured, value, target })

  add(
    'documents',
    metrics.documentsVerified === true,
    metrics.documentsVerified === null
      ? 'Garage documents are off'
      : metrics.documentsVerified
        ? 'All required approved'
        : 'Not all required approved',
    'Every required document approved'
  )

  const ratingMet =
    metrics.rating !== null && metrics.rating >= R.minRating && metrics.reviewCount >= R.minReviews
  add(
    'rating',
    ratingMet,
    metrics.rating === null
      ? 'No reviews yet'
      : `${metrics.rating.toFixed(1)} from ${plural(metrics.reviewCount, 'review')}`,
    `${R.minRating} or more, at least ${R.minReviews} reviews`
  )

  add('completed', metrics.completed >= R.minCompleted, String(metrics.completed), `At least ${R.minCompleted}`)

  const considered = metrics.responses.inTime + metrics.responses.missed
  if (considered === 0) {
    add('response', true, 'No bookings with a deadline yet', `At least ${percent(R.minResponseRate)}`, false)
  } else {
    const rate = metrics.responses.inTime / considered
    add(
      'response',
      rate >= R.minResponseRate,
      `${percent(rate)} (${metrics.responses.inTime} of ${considered})`,
      `At least ${percent(R.minResponseRate)}`
    )
  }

  if (metrics.completed === 0) {
    // Nothing to divide by: the completed standard already fails, and any
    // complaint at all is too many.
    add(
      'complaints',
      metrics.complaints === 0,
      plural(metrics.complaints, 'complaint'),
      `Under ${percent(R.maxComplaintRate)} of completed`,
      metrics.complaints > 0
    )
  } else {
    const rate = metrics.complaints / metrics.completed
    add(
      'complaints',
      rate < R.maxComplaintRate,
      `${percent(rate)} (${plural(metrics.complaints, 'complaint')})`,
      `Under ${percent(R.maxComplaintRate)} of completed`
    )
  }

  add(
    'no_shows',
    metrics.garageNoShows <= R.maxGarageNoShows,
    String(metrics.garageNoShows),
    R.maxGarageNoShows === 0 ? 'None' : `At most ${R.maxGarageNoShows}`
  )

  const photos = metrics.photoCompliance ?? PHOTO_COMPLIANCE_NOT_MEASURED
  if (!photos.measured) {
    add('photos', true, 'Not measured yet', `At least ${percent(R.minPhotoCompliance)} of jobs`, false)
  } else if (photos.rate === null) {
    add('photos', true, 'No jobs to measure yet', `At least ${percent(R.minPhotoCompliance)} of jobs`, false)
  } else {
    add(
      'photos',
      photos.rate >= R.minPhotoCompliance,
      `${percent(photos.rate)} of ${plural(photos.jobs, 'job')}`,
      `At least ${percent(R.minPhotoCompliance)} of jobs`
    )
  }

  return { eligible: rules.every((rule) => rule.met), rules }
}

/** "Rating, Garage no-shows (90 days)": the standards not met, for an alert or a reason. */
export function unmetLine(eligibility: Eligibility): string {
  return eligibility.rules
    .filter((rule) => !rule.met)
    .map((rule) => rule.label)
    .join(', ')
}

/**
 * The window's first instant: the start of the IST day `windowDays − 1`
 * days before today, so the window is 90 IST calendar days, today included.
 */
export function windowStart(now: Date): Date {
  return istMidnight(addDays(istDateKey(now), -(CERTIFICATION_RULES.windowDays - 1)))
}

// ─── Quality checks ──────────────────────────────────────────────────────────

export const QUALITY_CHECK_KINDS = ['mystery_visit', 'inspection'] as const
export type QualityCheckKind = (typeof QUALITY_CHECK_KINDS)[number]

export const QUALITY_CHECK_KIND_LABELS: Record<QualityCheckKind, string> = {
  mystery_visit: 'Mystery visit',
  inspection: 'Inspection',
}

export const QUALITY_CHECK_RESULTS = ['pass', 'fail'] as const
export type QualityCheckResult = (typeof QUALITY_CHECK_RESULTS)[number]

/** How far back a check's date may be when it is recorded. */
export const QUALITY_CHECK_MAX_AGE_DAYS = 365

export interface QualityCheckRow {
  /** The IST date of the visit, "YYYY-MM-DD". */
  checkedOn: string
  result: QualityCheckResult
  createdAt: Date
}

/** A date key plus whole months, the day kept where the month has it (31 Mar + 6 → 30 Sep). */
export function addMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number]
  const index = year * 12 + (month - 1) + months
  const y = Math.floor(index / 12)
  const m = index - y * 12
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const d = Math.min(day, lastDay)
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export type QualityCheckStatus = 'passed' | 'failed' | 'expired' | 'none'

export interface QualityCheckStanding<T extends QualityCheckRow = QualityCheckRow> {
  /** A pass is the latest check of the last 6 months. */
  valid: boolean
  status: QualityCheckStatus
  /** The latest check of the last 6 months, pass or fail. */
  latest: T | null
  /** The last day a passing check still counts; null unless valid. */
  validUntil: string | null
}

/**
 * Whether Detlio's check stands on `today` (an IST date key): the latest
 * check dated in the last 6 months is a pass. A later failed check overrides
 * an earlier pass, so a garage that failed its re-check is not certified on
 * the strength of the one before. Checks dated after today are ignored (the
 * API refuses them anyway).
 */
export function qualityCheckStanding<T extends QualityCheckRow>(
  checks: readonly T[],
  today: string
): QualityCheckStanding<T> {
  const from = addMonths(today, -CERTIFICATION_RULES.qualityCheckMonths)
  const ordered = [...checks]
    .filter((check) => check.checkedOn <= today)
    .sort((a, b) =>
      a.checkedOn === b.checkedOn
        ? b.createdAt.getTime() - a.createdAt.getTime()
        : a.checkedOn < b.checkedOn
          ? 1
          : -1
    )
  const latest = ordered.find((check) => check.checkedOn >= from) ?? null
  if (latest?.result === 'pass') {
    return {
      valid: true,
      status: 'passed',
      latest,
      validUntil: addMonths(latest.checkedOn, CERTIFICATION_RULES.qualityCheckMonths),
    }
  }
  if (latest) return { valid: false, status: 'failed', latest, validUntil: null }
  return {
    valid: false,
    status: ordered.some((check) => check.result === 'pass') ? 'expired' : 'none',
    latest: null,
    validUntil: null,
  }
}

/** Why a check can't be recorded as given, or null. */
export function qualityCheckDateRefusal(checkedOn: string, today: string): 'future' | 'too_old' | null {
  if (checkedOn > today) return 'future'
  if (daysBetween(checkedOn, today) > QUALITY_CHECK_MAX_AGE_DAYS) return 'too_old'
  return null
}

// ─── Certified ───────────────────────────────────────────────────────────────

/** The stored certification facts (vendor_certifications). */
export interface CertificationRow {
  certifiedAt: Date | string | null
  revokedAt: Date | string | null
}

/**
 * **Certified**: certified by an admin, and not revoked or lost since.
 * Certify clears the revocation, so a re-certified garage reads certified.
 * The SQL twin is CERTIFIED_GARAGE (vendors.predicates.ts), pinned to this
 * by vendors.predicates.test.ts. Change one, change both.
 */
export function isCertified(row: CertificationRow | null | undefined): boolean {
  return row != null && row.certifiedAt != null && row.revokedAt == null
}

export type CertifyRefusal = 'in_bin' | 'already_certified' | 'not_eligible' | 'no_passing_check'

/** Why Certify can't be pressed now, or null. */
export function certifyRefusal(input: {
  inBin: boolean
  certified: boolean
  eligible: boolean
  checkValid: boolean
}): CertifyRefusal | null {
  if (input.inBin) return 'in_bin'
  if (input.certified) return 'already_certified'
  if (!input.eligible) return 'not_eligible'
  if (!input.checkValid) return 'no_passing_check'
  return null
}

/** How a certification ended: an admin's Revoke, or the 14 days running out. */
export type RevokeKind = 'revoked' | 'lapsed'

/** Who `revoked_by` names when the nightly run takes the badge away. */
export const AUTOMATIC_ACTOR = 'Detlio (automatic)'

// ─── The nightly evaluation ──────────────────────────────────────────────────

/**
 * The hour (IST) the daily run starts. Each garage is evaluated once per run,
 * on the first cron tick from then on (bounded batches), so its alerts land
 * before the team's 07:00 roll-up rather than at 2 am.
 */
export const RUN_START_HOUR_IST = 5

/**
 * The start of the run `now` belongs to: today's 05:00 IST, or yesterday's
 * before then. A garage last evaluated before it is due.
 */
export function evaluationRunStart(now: Date): Date {
  const today = istDateKey(now)
  const todays = new Date(istMidnight(today).getTime() + RUN_START_HOUR_IST * 60 * 60 * 1000)
  return now.getTime() >= todays.getTime()
    ? todays
    : new Date(istMidnight(addDays(today, -1)).getTime() + RUN_START_HOUR_IST * 60 * 60 * 1000)
}

export interface EvaluationState {
  certified: boolean
  /** While certified and falling short: when it was first found short. */
  ineligibleSince: Date | null
  /** The last evaluation's answer; null when never evaluated. */
  lastEligible: boolean | null
  /** When ops were last told it became eligible. */
  eligibleAlertedAt: Date | null
}

export type EvaluationAlert = 'eligible' | 'at_risk' | 'lapsed'

export interface EvaluationPlan {
  ineligibleSince: Date | null
  eligibleAlertedAt: Date | null
  /** Take the badge away now (revoke kind 'lapsed'). */
  lapse: boolean
  /** What ops are told, if anything. */
  alert: EvaluationAlert | null
  /** IST days it has fallen short, while certified; 0 otherwise. */
  daysShort: number
}

/**
 * One garage's nightly outcome.
 *
 * Certified: it stands while it is eligible **and** Detlio's check stands.
 * The first night it does not, the 14 days start (ops told: at risk); a
 * night it does again clears them; on the 14th IST day since the first
 * (`graceDays`), it loses the badge (ops told: lost).
 *
 * Not certified: ops are told when it becomes eligible (to arrange a check),
 * at most once every 14 days, so a garage hovering at a threshold does not
 * post every night.
 */
export function planEvaluation(
  state: EvaluationState,
  outcome: { eligible: boolean; checkValid: boolean },
  now: Date
): EvaluationPlan {
  const R = CERTIFICATION_RULES
  if (state.certified) {
    if (outcome.eligible && outcome.checkValid) {
      return { ineligibleSince: null, eligibleAlertedAt: state.eligibleAlertedAt, lapse: false, alert: null, daysShort: 0 }
    }
    const since = state.ineligibleSince ?? now
    const daysShort = Math.max(0, daysBetween(istDateKey(since), istDateKey(now)))
    if (daysShort >= R.graceDays) {
      return { ineligibleSince: since, eligibleAlertedAt: state.eligibleAlertedAt, lapse: true, alert: 'lapsed', daysShort }
    }
    return {
      ineligibleSince: since,
      eligibleAlertedAt: state.eligibleAlertedAt,
      lapse: false,
      alert: state.ineligibleSince ? null : 'at_risk',
      daysShort,
    }
  }

  const becameEligible = outcome.eligible && state.lastEligible !== true
  const cooledDown =
    state.eligibleAlertedAt === null ||
    daysBetween(istDateKey(state.eligibleAlertedAt), istDateKey(now)) >= R.eligibleAlertCooldownDays
  if (becameEligible && cooledDown) {
    return { ineligibleSince: null, eligibleAlertedAt: now, lapse: false, alert: 'eligible', daysShort: 0 }
  }
  return { ineligibleSince: null, eligibleAlertedAt: state.eligibleAlertedAt, lapse: false, alert: null, daysShort: 0 }
}

/** The last IST day a garage falling short since `since` keeps the badge. */
export function graceEndsOn(since: Date): string {
  return addDays(istDateKey(since), CERTIFICATION_RULES.graceDays - 1)
}

/** The reason a lapse records: what fell short, for how long. */
export function lapseReason(shortfall: string): string {
  return `Did not meet the Detlio Certified standards for ${CERTIFICATION_RULES.graceDays} days: ${shortfall}.`
}

/**
 * What fell short, in one line: the standards not met, and Detlio's check
 * when it does not stand. "Rating; Detlio's check has run out".
 */
export function shortfallLine(eligibility: Eligibility, check: Pick<QualityCheckStanding, 'valid' | 'status'>): string {
  const parts = [unmetLine(eligibility)]
  if (!check.valid) {
    parts.push(
      check.status === 'failed'
        ? "Detlio's latest check did not pass"
        : check.status === 'expired'
          ? "Detlio's check is over 6 months old"
          : "no check by Detlio yet"
    )
  }
  return parts.filter(Boolean).join('; ')
}

// ─── The snapshot ────────────────────────────────────────────────────────────

/**
 * What vendor_certifications.eligibility stores: the last evaluation, for
 * the admin list and to tell when a garage became eligible. Versioned, so a
 * later shape can tell an old one apart.
 */
export interface EligibilitySnapshot {
  version: 1
  evaluatedAt: string
  eligible: boolean
  checkValid: boolean
  rules: RuleResult[]
}

export function toSnapshot(
  eligibility: Eligibility,
  checkValid: boolean,
  now: Date
): EligibilitySnapshot {
  return {
    version: 1,
    evaluatedAt: now.toISOString(),
    eligible: eligibility.eligible,
    checkValid,
    rules: eligibility.rules,
  }
}
