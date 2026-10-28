/**
 * "Request a visit" / "Request a pickup" (customer reach, part 2, 0062): the
 * numbers and words the customer app and the garage portal show. The rules
 * themselves are the server's (apps/server/src/lib/booking-requests.ts);
 * the numbers here are held equal to it by booking-requests.parity.test.ts.
 */

export const REQUEST_RULES = {
  /** The garage's time to answer, in minutes. */
  respondMinutes: 120,
  /** No answer by then: Detlio phones the garage. */
  alertAfterMinutes: 30,
  /** The customer's time to confirm and pay a yes. */
  confirmMinutes: 120,
  /** Open requests a customer may have at once. */
  maxOpenPerCustomer: 2,
  /** Garages one request is offered to, the first included. */
  maxGarages: 2,
  /** "Pick a day": how many days ahead. */
  pickDayAheadDays: 14,
  /** The travel fees a garage may add, in rupees. */
  travelFees: [0, 100, 200] as const,
} as const

export type TravelFee = (typeof REQUEST_RULES.travelFees)[number]
export type WindowPart = 'morning' | 'afternoon' | 'evening'
export type RequestMode = 'doorstep' | 'pickup'

/** The parts of a day, as the chips say them. */
export const WINDOW_PART_LABELS: Record<WindowPart, string> = {
  morning: 'Morning 9–12',
  afternoon: 'Afternoon 2–5',
  evening: 'Evening 5–8',
}

/** The three promises under the request sheet's choices. */
export const REQUEST_PROMISES = [
  'No payment now',
  'They reply within 2 hours, or we ask the next garage',
  'Any travel fee is shown before you pay',
] as const

/** The travel fee chips on the garage's card. */
export function travelFeeLabel(fee: TravelFee): string {
  return fee === 0 ? 'None' : `+₹${fee}`
}

/** "Request a visit" / "Request a pickup". */
export function requestActionLabel(mode: RequestMode): string {
  return mode === 'pickup' ? 'Request a pickup' : 'Request a visit'
}

/** "1:52:10" or "52:10" left, from milliseconds; "0:00" once gone. */
export function countdownLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Sat 2 Nov", for a "Pick a day" chip (an IST date key). */
export function dayChipLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]
  return `${weekday} ${day} ${MONTHS[month! - 1]}`
}

/** "11:41 am" in IST, for "They reply by …" and "Confirm by …". */
export function istClock(iso: string): string {
  const at = new Date(new Date(iso).getTime() + (5 * 60 + 30) * 60_000)
  const hour = at.getUTCHours()
  const minute = at.getUTCMinutes()
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`
}

/** "Sat 17 Oct, 10:00 am": an accepted start time, in IST. */
export function istStartLabel(iso: string): string {
  const at = new Date(new Date(iso).getTime() + (5 * 60 + 30) * 60_000)
  return `${WEEKDAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}, ${istClock(iso)}`
}

/** "Tried 1 of 2 nearby garages." */
export function triedLine(tried: number, max: number = REQUEST_RULES.maxGarages): string {
  return `Tried ${tried} of ${max} nearby ${max === 1 ? 'garage' : 'garages'}.`
}
