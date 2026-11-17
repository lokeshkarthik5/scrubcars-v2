import type { AdminBypassFilter, AdminBypassSource, DropOffView } from '@repo/core/api/bypass-reports'

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

/** The second row (0077, only while Detlio's flags are on): which kind of entry. */
export const BYPASS_SOURCES = ['all', 'customer', 'detlio'] as const satisfies readonly AdminBypassSource[]

export const BYPASS_SOURCE_LABELS: Record<AdminBypassSource, string> = {
  all: 'All',
  customer: 'Customer reports',
  detlio: 'Flagged by Detlio',
}

/** The kind in the URL (?from=), or All. */
export function parseBypassSource(value: string | null | undefined): AdminBypassSource {
  return value && (BYPASS_SOURCES as readonly string[]).includes(value) ? (value as AdminBypassSource) : 'all'
}

/** The list with a chip chosen: `/bypass-reports` for the defaults, so Back is tidy. */
export function bypassListHref(show: AdminBypassFilter, from: AdminBypassSource = 'all'): string {
  const query = new URLSearchParams()
  if (show !== DEFAULT_FILTER) query.set('show', show)
  if (from !== 'all') query.set('from', from)
  const text = query.toString()
  return text ? `/bypass-reports?${text}` : '/bypass-reports'
}

/** One line under the chips: what the chosen one holds. */
export function bypassFilterHint(
  show: AdminBypassFilter,
  rules: { rewardAmount: string; strikeWindowDays: number; creditOn: boolean } | undefined,
  flagsOn = false
): string {
  const reward = rules ? `₹${Number(rules.rewardAmount).toLocaleString('en-IN')}` : 'the reward'
  switch (show) {
    case 'new':
      return `Look into each one, then Confirm or Dismiss. Confirming adds a strike to the garage and ${reward} of Detlio credit to the customer (once per garage${rules && !rules.creditOn ? ', owed until credit is on' : ''}).${flagsOn ? ' A Detlio flag has no customer, so no credit.' : ''}`
    case 'confirmed':
      return `A confirmed report is a strike against its garage for ${rules?.strikeWindowDays ?? 180} days, and makes it ineligible for Gold.`
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

/** "3 bookings with the same customer cancelled after inspection in 20 days:" */
export function inspectionRunLine(count: number, days: number): string {
  return `${count} bookings with the same customer cancelled after inspection in ${days} ${days === 1 ? 'day' : 'days'}:`
}

/** "6 of 14 regular customers stopped booking this garage in the last 30 days." */
export function regularsLine(evidence: { regulars: number; stopped: number; stoppedDays: number; bookingElsewhere: number }): string {
  const elsewhere =
    evidence.bookingElsewhere > 0 ? ` ${evidence.bookingElsewhere} of them still book other garages on Detlio.` : ''
  return `${evidence.stopped} of ${evidence.regulars} regular customers stopped booking this garage in the last ${evidence.stoppedDays} days.${elsewhere}`
}

/** What the check found in a note, in words: "a phone number and a UPI ID". */
export function foundLine(found: ReadonlyArray<'phone' | 'upi' | 'wording'>, confirmedByAi: boolean): string {
  const words = found.map((f) => (f === 'phone' ? 'a phone number' : f === 'upi' ? 'a UPI ID' : 'wording like “pay directly”'))
  const list = words.length <= 1 ? (words[0] ?? 'wording like “pay directly”') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
  return `Found by Detlio’s checks: ${list} in a note the customer can see.${confirmedByAi ? ' Checked by AI (numbers hidden).' : ''}`
}
