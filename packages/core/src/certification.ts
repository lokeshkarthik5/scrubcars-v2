/**
 * Gold (0063; built as Detlio Certified, 0048) for the apps: the numbers
 * behind it and Detlio's quality checks' words. The rules are the server's
 * (apps/server/src/lib/certification.ts, CERTIFICATION_RULES), kept equal by
 * its certification.parity.test.ts. What customers read about Gold (and
 * Bronze and Silver) is ./tiers.ts.
 *
 * No imports: the server's parity test loads this file by path.
 */

/** The same numbers as the server's CERTIFICATION_RULES (parity test): Gold's. */
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
