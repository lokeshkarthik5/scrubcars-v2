/**
 * The admin's "Preview on Home": the offer card exactly as a customer will
 * get it, built from the discount form while it is typed.
 *
 * The small print is a twin of the server's (apps/server/src/lib/offers.ts:
 * `offerMetaLine`, `tillLabel`, `endsSoonLabel`), which is what Home actually
 * sends: an offer has no free-text blurb, every word of it comes from the
 * code's own columns, so the preview cannot promise more than the code gives.
 * apps/server/src/lib/offer-preview.parity.test.ts fails if the two drift, so
 * change both together. No imports, so that test can load this file by path.
 */

// ─── The small print (twin of lib/offers.ts) ─────────────────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  return {
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
  }
}

function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

function istDayLabel(date: Date): string {
  const p = istParts(date)
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`
}

/** "6 PM", or "6:30 PM" when the minutes are not zero. */
function istTimeLabel(date: Date): string {
  const p = istParts(date)
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'AM' : 'PM'
  return p.minute === 0
    ? `${hour12} ${meridiem}`
    : `${hour12}:${String(p.minute).padStart(2, '0')} ${meridiem}`
}

/** Exact money, paise and all: "₹300", "₹149.50", "₹1,000". */
export function offerRupees(amount: string | number): string {
  const paise = Math.round(Number(amount) * 100)
  const whole = Math.floor(paise / 100).toLocaleString('en-IN')
  const rest = paise % 100
  return rest === 0 ? `₹${whole}` : `₹${whole}.${String(rest).padStart(2, '0')}`
}

/**
 * The last moment a code works, as a customer reads it: one ending at
 * midnight IST reads "Till Sat 17 Oct" (the day before); any other end names
 * its time, "Till 18 Oct, 6 PM".
 */
export function tillLabel(endsAt: Date): string {
  const p = istParts(endsAt)
  if (p.hour === 0 && p.minute === 0 && p.second === 0 && p.ms === 0) {
    return `Till ${istDayLabel(new Date(endsAt.getTime() - 1))}`
  }
  return `Till ${p.day} ${MONTHS[p.month]}, ${istTimeLabel(endsAt)}`
}

/** "Ends today" or "Ends Sun" once three days or fewer are left; else null. */
export function endsSoonLabel(endsAt: Date, now: Date): string | null {
  const lastDay = new Date(endsAt.getTime() - 1)
  const daysLeft = daysBetween(istDateKey(now), istDateKey(lastDay))
  if (daysLeft < 0 || daysLeft > 3) return null
  if (daysLeft === 0) return 'Ends today'
  return `Ends ${WEEKDAYS[istParts(lastDay).weekday]}`
}

export interface OfferSmallPrintRow {
  code: string
  discountType: 'percentage' | 'fixed'
  /** Decimal text as stored, or a number from the form; null or blank is none. */
  maxDiscountAmount: string | number | null
  minOrderAmount: string | number | null
  endsAt: Date | null
}

const hasAmount = (value: string | number | null): value is string | number =>
  value !== null && value !== '' && Number(value) > 0

/** "Up to ₹300 · Min ₹1,000 · Code DETAIL20 · Till Sat 17 Oct". */
export function offerMetaLine(row: OfferSmallPrintRow): string {
  const parts: string[] = []
  if (row.discountType === 'percentage' && hasAmount(row.maxDiscountAmount)) {
    parts.push(`Up to ${offerRupees(row.maxDiscountAmount)}`)
  }
  if (hasAmount(row.minOrderAmount)) parts.push(`Min ${offerRupees(row.minOrderAmount)}`)
  parts.push(`Code ${row.code}`)
  if (row.endsAt) parts.push(tillLabel(row.endsAt))
  return parts.join(' · ')
}

/**
 * The meta line as the coupon's two lines: the money and the code, then
 * the end date. (The coupon drops "Code X" itself: the stub shows the code.)
 */
export function splitMetaLine(metaLine: string): string[] {
  const at = metaLine.indexOf(' · Till ')
  if (at === -1) return [metaLine]
  return [metaLine.slice(0, at), metaLine.slice(at + 3)]
}

// ─── The card ────────────────────────────────────────────────────────────────

/** What the discount form knows, as typed. Numbers are null when blank. */
export interface OfferDraft {
  code: string
  title: string
  discountType: 'percentage' | 'fixed'
  percentOff: number | null
  amountOff: number | null
  maxDiscountAmount: number | null
  minOrderAmount: number | null
  /** ISO, or null with no end date yet. */
  endsAt: string | null
  /** Null for a Detlio-wide code. */
  vendorName: string | null
}

export interface OfferCardPreview {
  eyebrow: { kind: 'garage' | 'detlio'; label: string }
  title: string
  /** The shape @repo/core/offer-figure's OfferFigure takes. */
  figure: { kind: 'percent'; value: number } | { kind: 'amount'; rupees: number }
  code: string
  metaLines: string[]
}

/** Shown on the card while the title field is still empty. */
export const PREVIEW_TITLE_PLACEHOLDER = 'Your title shows here'

export function offerCardPreview(draft: OfferDraft): OfferCardPreview {
  const code = draft.code.trim().toUpperCase()
  const metaLine = offerMetaLine({
    code: code || 'CODE',
    discountType: draft.discountType,
    maxDiscountAmount: draft.maxDiscountAmount,
    minOrderAmount: draft.minOrderAmount,
    endsAt: draft.endsAt ? new Date(draft.endsAt) : null,
  })
  return {
    eyebrow: draft.vendorName
      ? { kind: 'garage', label: draft.vendorName }
      : { kind: 'detlio', label: 'Detlio' },
    title: draft.title.trim() || PREVIEW_TITLE_PLACEHOLDER,
    figure:
      draft.discountType === 'percentage'
        ? { kind: 'percent', value: draft.percentOff ?? 0 }
        : { kind: 'amount', rupees: draft.amountOff ?? 0 },
    code: code || 'CODE',
    metaLines: splitMetaLine(metaLine),
  }
}

/** "Tap opens": where the card takes a customer. */
export function tapOpensLabel(vendorName: string | null): string {
  return vendorName
    ? `${vendorName}, code applied at checkout`
    : 'Garage list, code applied at checkout'
}

// ─── Order on Home ───────────────────────────────────────────────────────────

export const HOME_PRIORITY_LABELS = ['Normal', 'High', 'Top'] as const

/** The fields of a code that decide where it sits among the live offers. */
export interface OrderRow {
  id: string
  showOnHome: boolean
  isActive: boolean
  homePriority: number
  startsAt: string | null
  endsAt: string | null
  createdAt: string
}

function isLiveOnHome(row: OrderRow, now: Date): boolean {
  if (!row.showOnHome || !row.isActive || !row.endsAt) return false
  if (row.startsAt && Date.parse(row.startsAt) > now.getTime()) return false
  return Date.parse(row.endsAt) > now.getTime()
}

/**
 * The offers live on Home now, in Home's order before any targeting:
 * priority, then the one ending soonest, then the newest.
 */
export function rankLiveOffers<T extends OrderRow>(rows: T[], now: Date): T[] {
  return rows
    .filter((row) => isLiveOnHome(row, now))
    .sort(
      (a, b) =>
        b.homePriority - a.homePriority ||
        Date.parse(a.endsAt!) - Date.parse(b.endsAt!) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt)
    )
}

/**
 * Where the draft would sit among the offers live on Home now:
 * `{ position: 1, total: 3 }`. Null when the draft itself would not be live
 * now (switched off, no end date, or starting later). `others` may include
 * the stored copy of the code being edited; it is not counted twice.
 */
export function homeOrder(
  draft: OrderRow,
  others: OrderRow[],
  now: Date
): { position: number; total: number } | null {
  if (!isLiveOnHome(draft, now)) return null
  const live = rankLiveOffers([draft, ...others.filter((row) => row.id !== draft.id)], now)
  return { position: live.findIndex((row) => row.id === draft.id) + 1, total: live.length }
}
