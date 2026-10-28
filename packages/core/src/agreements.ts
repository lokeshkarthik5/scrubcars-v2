/**
 * The Detlio garage agreement for the apps (0063): the words the garage
 * portal and admin show, and the upload limits admin checks before asking
 * for a link. The rules are the server's (apps/server/src/lib/agreements.ts),
 * kept equal by its agreements.parity.test.ts.
 *
 * No imports: the server's parity test loads this file by path.
 */

/** "Detlio garage agreement v2". */
export const AGREEMENT_TITLE = 'Detlio garage agreement'

/** The tick the owner seat must give before Confirm. */
export const AGREEMENT_TICK = 'I agree to the terms'

export const AGREEMENT_CONTENT_TYPE = 'application/pdf'
export const AGREEMENT_MAX_BYTES = 10 * 1024 * 1024
export const AGREEMENT_GRACE_DAYS = 30
export const AGREEMENT_NOTE_MAX = 300

export function agreementTitle(version: number): string {
  return `${AGREEMENT_TITLE} v${version}`
}

/** What is wrong with a file picked as the agreement, before anything is sent, or null. */
export function pickedAgreementProblem(file: { type: string; size: number }): string | null {
  if (file.type !== AGREEMENT_CONTENT_TYPE) return 'Pick a PDF.'
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > AGREEMENT_MAX_BYTES) return 'The PDF can be up to 10 MB.'
  return null
}

export type AgreementStatus = 'not_published' | 'accepted' | 'grace' | 'not_accepted'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`
}

/**
 * Home's banner while the owner has a version to accept, or null: a new
 * version (with the day Bronze runs out), or never accepted.
 */
export function agreementBannerLine(standing: {
  status: AgreementStatus
  latestVersion: number | null
  acceptBy: string | null
}): string | null {
  if (standing.latestVersion === null) return null
  if (standing.status === 'grace' && standing.acceptBy) {
    return `Detlio has updated the garage agreement (v${standing.latestVersion}). Accept it by ${dayLabel(standing.acceptBy)} to keep your tier.`
  }
  if (standing.status === 'not_accepted') {
    return `Accept the ${agreementTitle(standing.latestVersion)} to earn Bronze and show customers you are with Detlio.`
  }
  return null
}
