import type {
  DataResetChain,
  DataResetCheckout,
  DataResetPreview,
} from '@repo/core/api/admin'
import {
  csvCell,
  formatWhenForSheet,
  paymentStatusLabel,
  phoneForSheet,
} from '@/lib/bookings'

/**
 * Wording and the CSV for "Start pilot clean" (the test-data reset), shared
 * by its page and the one-booking delete on a booking's page.
 */

/** What happens to a row, in the CSV and on screen. */
export function outcomeLabel(
  row: Pick<DataResetChain, 'kept' | 'selected'> & {
    teamTest?: DataResetChain['teamTest']
  }
): string {
  if (row.kept) return row.kept.label
  // A team test (0065): real money, all refunded, its record kept.
  if (row.selected && row.teamTest) return `Deleted. ${row.teamTest.label}`
  return row.selected ? 'Deleted' : 'Unticked — kept'
}

const CHAIN_COLUMNS: Array<
  [string, (c: DataResetChain) => string | number | null]
> = [
  ['What', () => 'Booking'],
  // With its "#": see the bookings export.
  ['Reference', (c) => `#${c.reference}`],
  ['Outcome', outcomeLabel],
  ['Why kept', (c) => c.kept?.detail ?? null],
  ['Booked (IST)', (c) => formatWhenForSheet(c.createdAt)],
  ['Scheduled (IST)', (c) => formatWhenForSheet(c.scheduledAt)],
  ['Status', (c) => c.status],
  ['Garage', (c) => c.garage.name],
  ['Customer', (c) => c.customer.name],
  ['Customer phone', (c) => phoneForSheet(c.customer.phone)],
  ['Amount', (c) => Number(c.amount)],
  ['Payment', (c) => paymentStatusLabel(c.paymentStatus ?? undefined)],
  ['Money', (c) => c.moneyLabel],
  ['Razorpay ids', (c) => c.razorpayIds.join(' ')],
  ['Receipt number', (c) => c.receiptNumber],
  ['Refunded', (c) => (Number(c.refunded) > 0 ? Number(c.refunded) : null)],
  ['Marked Test', (c) => (c.markedTest ? 'Yes' : null)],
  ['Booking ids', (c) => c.bookingIds.join(' ')],
]

/** A checkout row in the same columns, so the file is one table. */
const CHECKOUT_CELLS: Record<
  string,
  (c: DataResetCheckout) => string | number | null
> = {
  What: () => 'Checkout, no booking',
  Reference: (c) => `#${c.reference}`,
  Outcome: outcomeLabel,
  'Why kept': (c) => c.kept?.detail ?? null,
  'Booked (IST)': (c) => formatWhenForSheet(c.createdAt),
  Status: (c) => c.status,
  Garage: (c) => c.garageName,
  Customer: (c) => c.customer.name,
  Amount: (c) => Number(c.amount),
  Money: (c) => c.moneyLabel,
  'Razorpay ids': (c) => c.paymentRef,
  Refunded: (c) => (Number(c.refunded) > 0 ? Number(c.refunded) : null),
  'Booking ids': (c) => c.id,
}

/**
 * A cutoff run's complaints, as one line in the same columns: they go or
 * stay together. None when there are none in scope.
 */
function complaintsCsvRow(
  preview: DataResetPreview,
  headers: string[]
): string[] {
  const { complaints } = preview
  if (!complaints || complaints.count === 0) return []
  const cells: Record<string, string | number | null> = {
    What: `Complaints made before the cutoff (${complaints.count})`,
    Reference:
      complaints.firstNumber === complaints.lastNumber
        ? complaints.firstNumber
        : `${complaints.firstNumber} to ${complaints.lastNumber}`,
    Outcome: complaints.selected ? 'Deleted' : 'Unticked — kept',
  }
  return [headers.map((header) => csvCell(cells[header] ?? null)).join(',')]
}

/** A cutoff run's usage events, as one line in the same columns. None when there are none. */
function analyticsCsvRow(
  preview: DataResetPreview,
  headers: string[]
): string[] {
  const events = preview.analyticsEvents
  if (!events || events.count === 0) return []
  const cells: Record<string, string | number | null> = {
    What: `Usage events recorded before the cutoff (${events.count})`,
    Outcome: events.selected ? 'Deleted' : 'Unticked — kept',
  }
  return [headers.map((header) => csvCell(cells[header] ?? null)).join(',')]
}

/**
 * The dry run's list as a CSV: every row in scope, deleted or kept, with
 * what happens to it and why. Kept alongside the database backup, it is the
 * owner's own record of what went.
 */
export function dataResetCsv(preview: DataResetPreview): string {
  const headers = CHAIN_COLUMNS.map(([header]) => header)
  const lines = [
    headers.map(csvCell).join(','),
    ...preview.chains.map((chain) =>
      CHAIN_COLUMNS.map(([, read]) => csvCell(read(chain))).join(',')
    ),
    ...preview.checkouts.map((checkout) =>
      headers
        .map((header) => csvCell(CHECKOUT_CELLS[header]?.(checkout) ?? null))
        .join(',')
    ),
    ...complaintsCsvRow(preview, headers),
    ...analyticsCsvRow(preview, headers),
  ]
  return `${lines.join('\r\n')}\r\n`
}

/**
 * "Tick all": the deletable rows in the list's order (oldest first, the
 * order a run takes them in), up to what one run deletes. `left` is how many
 * wait for the next run. Ticking more would only be cut back by the server.
 */
export function tickAll(
  deletableIds: string[],
  cap: number
): { ticked: Set<string>; left: number } {
  return {
    ticked: new Set(deletableIds.slice(0, cap)),
    left: Math.max(0, deletableIds.length - cap),
  }
}

/**
 * The ticks after the list is loaded again: what the server ticks, less
 * every row the owner unticked. Unticking a real booking is how the owner
 * protects it, so a reload must never quietly tick it again.
 */
export function ticksAfterReload(
  serverSelected: string[],
  unticked: ReadonlySet<string>
): Set<string> {
  return new Set(serverSelected.filter((id) => !unticked.has(id)))
}

/** Typed as shown, give or take spaces: the server's own rule. */
export function phraseTyped(typed: string, phrase: string): boolean {
  return typed.trim().replace(/\s+/g, ' ') === phrase
}

/** "143 bookings", "1 checkout": a count with its noun. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
