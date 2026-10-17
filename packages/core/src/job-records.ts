import { APP_TIMEZONE } from '@repo/core/utils'

/**
 * Display rules for a job's records — step times, photos and the final bill —
 * shared by the customer app, the garage portal and the admin panel, so the
 * three never describe one job differently. Pure; the clock is passed in.
 */

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIME = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: APP_TIMEZONE,
})

const DAY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: APP_TIMEZONE,
})

/** "10:42 am" — assembled from parts, as ICU versions punctuate differently. */
function clock(date: Date): string {
  const parts = TIME.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('hour')}:${part('minute')} ${part('dayPeriod').toLowerCase()}`
}

/**
 * When a job step happened, as short as it can be said: "10:42 am" today,
 * "4 Oct, 10:42 am" any other day. Chennai time, whatever the device says.
 */
export function formatStepTime(iso: string, now: number = Date.now()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const sameDay = DAY_KEY.format(date) === DAY_KEY.format(new Date(now))
  return sameDay ? clock(date) : `${DAY.format(date)}, ${clock(date)}`
}

/**
 * The step times a garage's job card lists, latest last: "Accepted 9:15 am",
 * "Started 10:42 am", "Completed 12:05 pm". Steps with no recorded time are
 * left out rather than guessed.
 */
export function jobStepTimes(
  booking: {
    acceptedAtIso?: string
    startedAtIso?: string
    completedAtIso?: string
    /** Pickup & drop's handover steps, in their place in the job. */
    pickup?: {
      pickedUpAtIso?: string
      atGarageAtIso?: string
      outForDeliveryAtIso?: string
      deliveredAtIso?: string
    }
  },
  now: number = Date.now()
): string[] {
  const pickup = booking.pickup
  return [
    booking.acceptedAtIso && `Accepted ${formatStepTime(booking.acceptedAtIso, now)}`,
    pickup?.pickedUpAtIso && `Picked up ${formatStepTime(pickup.pickedUpAtIso, now)}`,
    pickup?.atGarageAtIso && `At garage ${formatStepTime(pickup.atGarageAtIso, now)}`,
    booking.startedAtIso && `Started ${formatStepTime(booking.startedAtIso, now)}`,
    pickup?.outForDeliveryAtIso &&
      `Out for delivery ${formatStepTime(pickup.outForDeliveryAtIso, now)}`,
    // Delivered is the completion of a pickup job: said once, as Delivered.
    pickup?.deliveredAtIso
      ? `Delivered ${formatStepTime(pickup.deliveredAtIso, now)}`
      : booking.completedAtIso && `Completed ${formatStepTime(booking.completedAtIso, now)}`,
  ].filter((line): line is string => Boolean(line))
}

/** How many photos of each stage a job can hold. Mirrors MAX_PHOTOS_PER_STAGE. */
export const MAX_JOB_PHOTOS_PER_STAGE = 6

/**
 * How long after completion a garage can still add or remove job photos.
 * Mirrors PHOTO_EDIT_WINDOW_DAYS in the server's lib/job-records.ts.
 */
export const PHOTO_EDIT_WINDOW_DAYS = 7

/**
 * The figures a final bill shows while the garage types it: the total of the
 * lines so far, and what the customer would have left to pay. Added in paise,
 * like the server, so the live total and the saved one never differ by a
 * paisa. Lines with no valid amount yet count as nothing.
 */
export function finalBillFigures(
  amounts: Array<number | string>,
  paidBefore: number
): { total: number; amountDue: number } {
  const paise = amounts.reduce<number>((sum, value) => {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) && n > 0 ? sum + Math.round(n * 100) : sum
  }, 0)
  const due = Math.max(0, paise - Math.round(paidBefore * 100))
  return { total: paise / 100, amountDue: due / 100 }
}

/** Rupees as every bill line shows them: "₹2,201", or "₹2,201.50" with paise. */
export function formatRupees(amount: number): string {
  const paise = Math.round(amount * 100) % 100 !== 0
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/**
 * How long after completion a garage can still raise a final bill. Mirrors
 * FINAL_BILL_WINDOW_DAYS in the server's lib/final-bill.ts.
 */
export const FINAL_BILL_WINDOW_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a booking's final bill can still appear or change, so the booking
 * page keeps re-reading it after the job is done. A garage may raise or
 * replace an inspection job's bill up to three days after completion, and a
 * bill being paid settles when the webhook lands, so a customer with the page
 * open would otherwise keep looking at "Your car is ready" and no bill — or
 * at "confirming" for a bill already paid — until they reloaded.
 */
export function finalBillMayChange(
  booking: {
    status: string
    items: Array<{ pricingType?: string }>
    finalBill: { status: string } | null
    completedAtIso?: string
    scheduledAtIso: string
  },
  now: number
): boolean {
  if (booking.status === 'cancelled' || booking.status === 'rescheduled') return false
  if (booking.finalBill?.status === 'due') return true
  if (booking.finalBill?.status === 'paid') return false
  if (!booking.items.some((item) => item.pricingType === 'on_inspection')) return false
  if (booking.status === 'in_progress') return true
  if (booking.status !== 'completed') return false
  const finished = Date.parse(booking.completedAtIso ?? booking.scheduledAtIso)
  return Number.isFinite(finished) && now - finished <= FINAL_BILL_WINDOW_DAYS * DAY_MS
}

/** "Due", "Paid", "Nothing due" — a bill's state in two words or fewer. */
export function finalBillStatusLabel(status: 'due' | 'paid' | 'cancelled' | 'not_needed'): string {
  switch (status) {
    case 'due':
      return 'Due'
    case 'paid':
      return 'Paid'
    case 'not_needed':
      return 'Nothing due'
    case 'cancelled':
      return 'Replaced'
  }
}
