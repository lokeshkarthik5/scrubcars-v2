import type { ShineCheckStatus } from '@repo/core/api/shine-score'

/**
 * Wording for Issues → Shine checks (0078): its chips and what each means.
 * The rule (an after-score under 60) is the server's; the number comes with
 * each answer.
 */

export const SHINE_CHECK_FILTERS = ['new', 'looks_fine', 'followed_up'] as const satisfies readonly ShineCheckStatus[]

export const SHINE_CHECK_LABELS: Record<ShineCheckStatus, string> = {
  new: 'New',
  looks_fine: 'Looks fine',
  followed_up: 'Followed up',
}

/** The chip in the URL (?show=), or New. */
export function parseShineFilter(value: string | null | undefined): ShineCheckStatus {
  return value && (SHINE_CHECK_FILTERS as readonly string[]).includes(value) ? (value as ShineCheckStatus) : 'new'
}

/** The list with a chip chosen: `/shine-checks` for New, so Back is tidy. */
export function shineListHref(show: ShineCheckStatus): string {
  return show === 'new' ? '/shine-checks' : `/shine-checks?show=${show}`
}

/** One line under the chips. */
export function shineFilterHint(show: ShineCheckStatus, lowAfterScore: number | undefined): string {
  const under = lowAfterScore ?? 60
  switch (show) {
    case 'new':
      return `An after-score under ${under} lands here. Look at the photos, then mark it Looks fine or Follow up (a call to the garage, or a complaint logged for the customer).`
    case 'looks_fine':
      return 'Checked by the team and fine. Nothing happened to the garage.'
    case 'followed_up':
      return 'The team called the garage or logged a complaint. The score itself never counts against a garage.'
  }
}
