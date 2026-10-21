/**
 * The admin Statistics page's twin of the server's range rules
 * (apps/server/src/lib/stats.ts): how many days a range covers, and which
 * period it is compared with. The page names the comparison ("Compare with
 * previous 30 days") before it has asked the server for anything, so it
 * needs the rule itself; a parity test in apps/server/src/lib keeps the two
 * the same.
 *
 * Ranges are IST calendar dates, "YYYY-MM-DD", both included. Worked on as
 * UTC dates, which never shift: a date key has no time of day.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** A date key plus some days. */
export function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** How many days a range covers, both ends included. */
export function rangeDays(range: { from: string; to: string }): number {
  const span = Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)
  return Math.round(span / DAY_MS) + 1
}

/** Whether the range is one whole calendar month. */
export function isWholeMonth(range: { from: string; to: string }): boolean {
  return (
    range.from.endsWith('-01') &&
    addDays(range.to, 1).endsWith('-01') &&
    range.from.slice(0, 7) === range.to.slice(0, 7)
  )
}

/**
 * The period a range is compared with: a whole calendar month with the month
 * before it, anything else with the same number of days just before it.
 */
export function previousStatsRange(range: { from: string; to: string }): {
  from: string
  to: string
} {
  if (isWholeMonth(range)) {
    const to = addDays(range.from, -1)
    return { from: `${to.slice(0, 7)}-01`, to }
  }
  const days = rangeDays(range)
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) }
}
