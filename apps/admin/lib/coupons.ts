import type { AdminCouponBatch, CouponRedemption, PrintedCode } from '@repo/core/api/coupons'
import { toCsv } from '@repo/core/csv'

/**
 * Printed coupons (0055) in the panel: the words and sums the pages share.
 * Pure, so each has a test.
 */

export type BatchStage = 'void' | 'scheduled' | 'running' | 'ended'

/** Where a batch stands today (IST date keys compare as text). */
export function batchStage(batch: Pick<AdminCouponBatch, 'voided' | 'validFromDate' | 'validToDate'>, todayKey: string): BatchStage {
  if (batch.voided) return 'void'
  if (todayKey < batch.validFromDate) return 'scheduled'
  if (todayKey > batch.validToDate) return 'ended'
  return 'running'
}

export const STAGE_LABELS: Record<BatchStage, string> = {
  void: 'Void',
  scheduled: 'Not started',
  running: 'Running',
  ended: 'Ended',
}

export const STAGE_BADGES: Record<BatchStage, 'danger' | 'pending' | 'success' | 'muted'> = {
  void: 'danger',
  scheduled: 'pending',
  running: 'success',
  ended: 'muted',
}

/** "38%" of `of`, or "—" when there is nothing to divide by. */
export function rate(part: number, of: number): string {
  if (!(of > 0)) return '—'
  return `${Math.round((part / of) * 100)}%`
}

/** What "scanned" means for the kind: codes opened at least once, or the shared code's opens. */
export function scannedFigure(batch: Pick<AdminCouponBatch, 'kind' | 'figures'>): number {
  return batch.kind === 'unique' ? batch.figures.scannedCodes : batch.figures.scans
}

/** What was handed out: the codes printed, or (one shared code) the customers who added it. */
export function printedLabel(batch: Pick<AdminCouponBatch, 'kind' | 'codeCount' | 'maxRedemptions'>): string {
  if (batch.kind === 'unique') return `${batch.codeCount.toLocaleString('en-IN')} codes`
  return batch.maxRedemptions ? `1 shared code · up to ${batch.maxRedemptions.toLocaleString('en-IN')}` : '1 shared code'
}

export interface LocationRow {
  location: string
  batches: number
  printed: number
  scanned: number
  redeemed: number
  bookings: number
  revenue: number
  cost: number
  newCustomers: number
}

/**
 * Every batch's figures added up by where it was given out, so the team can
 * see which giveaway works best. Locations are matched ignoring case and
 * spaces at the ends; the first spelling seen names the row. Most bookings
 * first, then most added. A shared code counts as one printed piece.
 */
export function byLocation(batches: readonly AdminCouponBatch[]): LocationRow[] {
  const rows = new Map<string, LocationRow>()
  for (const batch of batches) {
    const key = batch.location.trim().toLowerCase()
    let row = rows.get(key)
    if (!row) {
      row = { location: batch.location.trim(), batches: 0, printed: 0, scanned: 0, redeemed: 0, bookings: 0, revenue: 0, cost: 0, newCustomers: 0 }
      rows.set(key, row)
    }
    row.batches += 1
    row.printed += batch.codeCount
    row.scanned += scannedFigure(batch)
    row.redeemed += batch.figures.redeemed
    row.bookings += batch.figures.bookings
    row.revenue += Number(batch.figures.revenue)
    row.cost += Number(batch.figures.cost)
    row.newCustomers += batch.figures.newCustomers
  }
  return [...rows.values()].sort((a, b) => b.bookings - a.bookings || b.redeemed - a.redeemed || a.location.localeCompare(b.location))
}

export const STATE_LABELS: Record<PrintedCode['state'] | CouponRedemption['state'], string> = {
  new: 'Not scanned',
  scanned: 'Scanned',
  redeemed: 'Added',
  void: 'Void',
  added: 'Stamps added',
  ready: 'Not used yet',
  used: 'Used',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

export const CHANNEL_LABELS: Record<CouponRedemption['channel'], string> = {
  link: 'QR link',
  typed: 'Typed in app',
  camera: 'Scanned in app',
}

/** The batch's codes as a CSV, for a print shop or a mail merge. */
export function codesCsv(batch: Pick<AdminCouponBatch, 'name' | 'title' | 'validToDate'>, codes: readonly PrintedCode[]): string {
  return toCsv(
    ['#', 'Code', 'Link (QR)', 'Offer', 'Valid till', 'State', 'Scans'],
    codes.map((code) => [code.seq, code.code, code.link, batch.title, batch.validToDate, STATE_LABELS[code.state], code.scans])
  )
}

/** Who added the batch's coupons, how, and what came of it. Phones arrive masked. */
export function redemptionsCsv(
  batch: Pick<AdminCouponBatch, 'name' | 'location'>,
  redemptions: readonly CouponRedemption[]
): string {
  return toCsv(
    ['Added', 'Campaign', 'Location', 'How', 'Code ends', 'Customer', 'Phone', 'State', 'Booking', 'Paid', 'Saved'],
    redemptions.map((r) => [
      r.addedAt.slice(0, 10),
      batch.name,
      batch.location,
      CHANNEL_LABELS[r.channel],
      r.codeSuffix,
      r.customer?.name ?? (r.customer ? '' : 'Deleted account'),
      r.customer?.phone ?? '',
      STATE_LABELS[r.state],
      r.booking?.id.slice(0, 8) ?? '',
      r.booking?.amount ?? '',
      r.booking?.discount ?? (r.stamps ? `${r.stamps} stamps` : ''),
    ])
  )
}

/** The print sheet's pages: 10 coupons to an A4 page (2 across, 5 down). */
export const COUPONS_PER_PAGE = 10

export function sheetPages<T>(codes: readonly T[], perPage = COUPONS_PER_PAGE): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < codes.length; i += perPage) pages.push(codes.slice(i, i + perPage))
  return pages
}

/** A typed whole number, or null when empty or not one. */
export function wholeOrNull(typed: string): number | null {
  const trimmed = typed.replace(/[,\s₹%]/g, '')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isInteger(value) ? value : Number.NaN
}

/** A filename-safe slug of the campaign's name. */
export function fileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'coupons'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "30 Nov 2026" from an IST date key, as printed on a coupon. */
export function printDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return dateKey
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** What goes on the sheet: never a void code; codes already added only when asked. */
export function codesToPrint<T extends { state: PrintedCode['state'] }>(codes: readonly T[], includeAdded: boolean): T[] {
  return codes.filter((code) => code.state !== 'void' && (includeAdded || code.state !== 'redeemed'))
}
