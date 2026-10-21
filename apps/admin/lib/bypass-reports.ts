import type { AdminBypassFilter, DropOffView } from '@repo/core/api/bypass-reports'

/**
 * Wording for the Bypass reports page (0052): its chips, what each means,
 * and how a garage's drop-off reads. The rules themselves are the server's
 * (lib/bypass-reports.ts, lib/drop-off.ts); the numbers come with each answer.
 */

export const BYPASS_FILTERS = ['new', 'confirmed', 'dismissed'] as const satisfies readonly AdminBypassFilter[]

export const BYPASS_FILTER_LABELS: Record<AdminBypassFilter, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
}

const DEFAULT_FILTER: AdminBypassFilter = 'new'

/** The chip in the URL (?show=), or New. */
export function parseBypassFilter(value: string | null | undefined): AdminBypassFilter {
  return value && (BYPASS_FILTERS as readonly string[]).includes(value) ? (value as AdminBypassFilter) : DEFAULT_FILTER
}

/** The list with a chip chosen: `/bypass-reports` for the default, so Back is tidy. */
export function bypassListHref(show: AdminBypassFilter): string {
  return show === DEFAULT_FILTER ? '/bypass-reports' : `/bypass-reports?show=${show}`
}

/** One line under the chips: what the chosen one holds. */
export function bypassFilterHint(show: AdminBypassFilter, rules: { rewardAmount: string; strikeWindowDays: number; creditOn: boolean } | undefined): string {
  const reward = rules ? `₹${Number(rules.rewardAmount).toLocaleString('en-IN')}` : 'the reward'
  switch (show) {
    case 'new':
      return `Look into each one, then Confirm or Dismiss. Confirming adds a strike to the garage and ${reward} of Detlio credit to the customer (once per garage${rules && !rules.creditOn ? ', owed until credit is on' : ''}).`
    case 'confirmed':
      return `A confirmed report is a strike against its garage for ${rules?.strikeWindowDays ?? 180} days, and makes it ineligible for Detlio Certified.`
    case 'dismissed':
      return 'Dismissed reports count for nothing. The reason is only for the team.'
  }
}

/** "33%", whole percent rounded down, as the garage card reads its figures. */
export function ratePercent(rate: number): string {
  return `${Math.floor(rate * 100 + 1e-9)}%`
}

/** How the drop-off rules read, in one sentence, from the numbers the server sent. */
export function dropOffRulesLine(rules: DropOffView['rules']): string {
  return (
    `A regular completed ${rules.regularMinCompleted}+ bookings at the garage in the last ${rules.regularWindowDays} days. ` +
    `They went quiet when they have booked nothing anywhere on Detlio for over ${rules.quietMultiplier}× their usual gap ` +
    `(at least ${rules.minQuietDays} days). Flagged: ${ratePercent(rules.flagRate)} or more of ${rules.flagMinRegulars}+ regulars.`
  )
}

/** "Every 14 days · quiet 62 days": a quiet regular's two figures. */
export function quietLine(row: { usualGapDays: number; quietDays: number; thresholdDays: number }): string {
  const gap = Number.isInteger(row.usualGapDays) ? String(row.usualGapDays) : row.usualGapDays.toFixed(1)
  return `Usually every ${gap} days · quiet ${row.quietDays} days (over ${row.thresholdDays})`
}
