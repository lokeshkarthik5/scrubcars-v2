/**
 * How a garage's earnings and payouts are worded, for the garage's Earnings
 * screen and admin's Payouts alike, so the two always say the same thing
 * about the same booking. The figures come from the server (lib/payouts.ts);
 * nothing here works out money, it only words and files it.
 */
import type { PayoutLine, PayoutLineStatus, PayoutMethod } from './api/admin'

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
// By hand rather than through Intl, as ist-input.ts does: ICU versions differ.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "8%", "5%". */
export function percentLabel(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

/** "₹1,234" or "₹1,234.50": rupees as every money figure here is shown. */
export function rupeesLabel(amount: number): string {
  const paise = Math.round(Math.abs(amount) * 100) % 100 !== 0
  const text = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return `${amount < 0 ? '−' : ''}₹${text}`
}

/**
 * The commission column: "Free — booking 12 of your first 25" inside the
 * free period, else the rate and the amount, "8% · ₹40" (a booking mixing
 * a wash with detailing reads "8% + 5% · ₹140").
 */
export function commissionLabel(line: Pick<PayoutLine, 'commission'>, audience: 'garage' | 'admin' = 'garage'): string {
  const { freePosition, freeOf, rates, amount } = line.commission
  if (freePosition !== null) {
    return `Free — booking ${freePosition} of ${audience === 'garage' ? 'your' : 'its'} first ${freeOf}`
  }
  if (rates.length === 0) return '—'
  return `${rates.map(percentLabel).join(' + ')} · ${rupeesLabel(amount)}`
}

export const LINE_STATUS_LABEL: Record<PayoutLineStatus, string> = {
  due: 'Due',
  paid: 'Paid',
  owed_back: 'Owed to Detlio',
  nothing_due: 'Nothing to pay',
}

export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = {
  bank: 'Bank transfer',
  upi: 'UPI',
  other: 'Other',
}

/** What earned it, as a line's tag says. */
export function lineKindLabel(kind: PayoutLine['kind']): string | null {
  if (kind === 'customer_no_show') return 'Customer no-show'
  if (kind === null) return 'Refunded after payout'
  return null
}

/** "17 Oct 2026", the IST date of a moment. */
export function istDateLabel(iso: string): string {
  const clock = new Date(new Date(iso).getTime() + IST_OFFSET_MS)
  return `${clock.getUTCDate()} ${MONTHS[clock.getUTCMonth()]} ${clock.getUTCFullYear()}`
}

/** The IST date of a moment as YYYY-MM-DD. */
export function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** A YYYY-MM-DD key plus some days. */
export function addDaysToKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 24 * HOUR_MS).toISOString().slice(0, 10)
}

/** The Earnings screen's quick ranges, as IST date keys, both included. */
export type EarningsRangePreset = 'last30' | 'thisMonth' | 'lastMonth'

export function earningsRange(preset: EarningsRangePreset, now: Date): { from: string; to: string } {
  const today = istDateKey(now)
  if (preset === 'last30') return { from: addDaysToKey(today, -29), to: today }
  const [year, month] = today.split('-').map(Number)
  const first = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`
  if (preset === 'thisMonth') return { from: first(year, month), to: today }
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 }
  return { from: first(prev.y, prev.m), to: addDaysToKey(first(year, month), -1) }
}

/** "5 h", "31 h", "3 days": how long the oldest unpaid booking has waited. */
export function waitedLabel(sinceIso: string, now: Date): string {
  const hours = Math.max(0, Math.floor((now.getTime() - new Date(sinceIso).getTime()) / HOUR_MS))
  if (hours < 48) return `${hours} h`
  return `${Math.floor(hours / 24)} days`
}

/**
 * A statement's bookings as CSV rows, header first. The garage's file and
 * admin's carry the same columns, so a garage and the team can compare them
 * line by line.
 */
export function statementCsvRows(lines: PayoutLine[]): {
  header: string[]
  rows: Array<Array<string | number | null>>
} {
  return {
    header: [
      'Booking',
      'Payable from (IST)',
      'Customer',
      'Services',
      'Price',
      'Detlio promo',
      'Garage promo',
      'Refunds',
      'Commission',
      'Commission note',
      'Your share',
      'Cash you collected',
      'Due in all',
      'Paid',
      'Balance',
      'Status',
      'Payout references',
    ],
    rows: lines.map((line) => [
      `#${line.reference}`,
      istDateLabel(line.payableFrom),
      line.customerFirstName,
      line.services.join(' + '),
      line.price.toFixed(2),
      line.detlioPromo.toFixed(2),
      line.garagePromo.toFixed(2),
      line.refunds.toFixed(2),
      line.commission.amount.toFixed(2),
      commissionLabel(line),
      line.share.toFixed(2),
      line.heldByGarage.toFixed(2),
      line.due.toFixed(2),
      line.paid.toFixed(2),
      line.balance.toFixed(2),
      LINE_STATUS_LABEL[line.status],
      line.payouts.map((payout) => payout.reference).join(' '),
    ]),
  }
}
