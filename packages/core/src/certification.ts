/**
 * Detlio Certified for the apps: the seal's words, what it means in plain
 * words for customers, and the numbers behind it. The rules are the
 * server's (apps/server/src/lib/certification.ts, CERTIFICATION_RULES);
 * these are the words and numbers the customer app, the garage portal and
 * admin show, kept equal to the server's by its certification.parity.test.ts.
 *
 * No imports: the server's parity test loads this file by path.
 */

/** The seal's name, on cards (as the icon's label) and the garage page. */
export const CERTIFIED_LABEL = 'Detlio Certified'

/** The garage page's one line under the seal. */
export const CERTIFIED_NOTE = 'Meets Detlio’s standards for quality and reliability.'

/** The same numbers as the server's CERTIFICATION_RULES (parity test). */
export const CERTIFICATION_THRESHOLDS = {
  windowDays: 90,
  minRating: 4.5,
  minReviews: 10,
  minCompleted: 20,
  minResponseRate: 0.9,
  maxComplaintRate: 0.03,
  maxGarageNoShows: 0,
  minPhotoCompliance: 0.9,
  maxBypassStrikes: 0,
  bypassWindowDays: 180,
  qualityCheckMonths: 6,
  graceDays: 14,
} as const

/**
 * "What this means": the standards in plain words, for the sheet on the
 * garage page. Every line is one the server measures (a seal must never
 * claim what nobody checked), photos included since 0045's photo
 * compliance counts toward it, and bypass reports since 0052 (a report
 * Detlio confirmed in the last 180 days).
 */
export const CERTIFIED_STANDARDS: readonly string[] = [
  'Detlio has checked the owner’s ID, bank details, shop and signed agreement.',
  `Rated ${CERTIFICATION_THRESHOLDS.minRating} or more by at least ${CERTIFICATION_THRESHOLDS.minReviews} customers.`,
  `At least ${CERTIFICATION_THRESHOLDS.minCompleted} jobs completed through Detlio in the last ${CERTIFICATION_THRESHOLDS.windowDays} days.`,
  `Answers at least ${Math.round(CERTIFICATION_THRESHOLDS.minResponseRate * 100)}% of bookings in time.`,
  `Complaints about damage, poor work or not turning up on fewer than ${Math.round(CERTIFICATION_THRESHOLDS.maxComplaintRate * 100)} in 100 jobs.`,
  `Has not missed a booking in the last ${CERTIFICATION_THRESHOLDS.windowDays} days.`,
  `Takes before and after photos of the car on at least ${Math.round(CERTIFICATION_THRESHOLDS.minPhotoCompliance * 100)}% of jobs.`,
  `Has not been found asking customers to book or pay outside Detlio in the last ${CERTIFICATION_THRESHOLDS.bypassWindowDays} days.`,
  `Visited and checked in person by Detlio in the last ${CERTIFICATION_THRESHOLDS.qualityCheckMonths} months.`,
]

/** The sheet's last line: how it is kept. */
export const CERTIFIED_KEPT_LINE =
  'Detlio checks these every day. A garage that stops meeting them loses the seal.'

/** The customer list's filter chip. */
export const CERTIFIED_FILTER_LABEL = 'Certified only'

export type QualityCheckKind = 'mystery_visit' | 'inspection'

export const QUALITY_CHECK_KIND_LABELS: Record<QualityCheckKind, string> = {
  mystery_visit: 'Mystery visit',
  inspection: 'Inspection',
}

export type QualityCheckStatus = 'passed' | 'failed' | 'expired' | 'none'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "31 Oct 2026" from an IST date key ("2026-10-31"); the key itself if it is not one. */
export function dateKeyLabel(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`
}

/** The garage portal's line about Detlio's check: never who or what they wrote. */
export function garageCheckLine(check: { status: QualityCheckStatus; passedOn: string | null }): string {
  switch (check.status) {
    case 'passed':
      return check.passedOn
        ? `Passed Detlio’s quality check on ${dateKeyLabel(check.passedOn)}`
        : 'Passed Detlio’s quality check'
    case 'failed':
      return 'Detlio’s last quality check did not pass. We’ll tell you what to put right.'
    case 'expired':
      return 'Detlio’s quality check is due again (it counts for 6 months).'
    default:
      return 'Detlio visits in person once you meet the standards below.'
  }
}
