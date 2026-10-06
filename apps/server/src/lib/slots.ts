// Vendor capacity is currently unlimited: a vendor is assumed to be able to run
// any number of jobs concurrently, so an existing booking never blocks a slot
// and several customers can book the same time. Availability is therefore a
// pure function of the working hours and the service duration.
//
// This is a deliberate early-stage simplification. When per-vendor capacity
// lands (`vendors.bays` is already collected and stored, just unused), the
// overlap check belongs here and in the booking transaction in
// bookings.repository.ts — both must apply the same rule, or the picker will
// offer slots the transaction then rejects.

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1] ?? 0)
  return hours * 60 + minutes
}

function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

export function generateSlotStartTimes(
  openTime: string,
  closeTime: string,
  intervalMins: number
): string[] {
  const slots: string[] = []
  const endMinutes = parseTimeToMinutes(closeTime)
  let current = parseTimeToMinutes(openTime)

  while (current + intervalMins <= endMinutes) {
    slots.push(minutesToTimeString(current))
    current += intervalMins
  }

  return slots
}

function combineDateAndTime(date: string, time: string): Date {
  return new Date(`${date}T${time}+05:30`)
}

export function computeAvailableSlots(input: {
  date: string
  openTime: string
  closeTime: string
  intervalMins: number
  isClosed: boolean
  serviceDurationMins: number
}): string[] {
  if (input.isClosed) {
    return []
  }

  const slotStarts = generateSlotStartTimes(
    input.openTime,
    input.closeTime,
    input.intervalMins
  )
  const closeAt = combineDateAndTime(input.date, input.closeTime)
  const available: string[] = []

  for (const startTime of slotStarts) {
    const blockStart = combineDateAndTime(input.date, startTime)
    const blockEnd = new Date(
      blockStart.getTime() + input.serviceDurationMins * 60 * 1000
    )

    if (blockEnd > closeAt) {
      continue
    }

    available.push(blockStart.toISOString())
  }

  return available
}

export function isScheduledAtAvailable(
  scheduledAt: Date,
  availableSlots: string[]
): boolean {
  const target = scheduledAt.getTime()
  return availableSlots.some((slot) => new Date(slot).getTime() === target)
}

// The timezone all slots are anchored to. Must match the offset used in
// combineDateAndTime (+05:30) so a slot's date key matches the day the
// customer selected in the slots endpoint.
const APP_TIMEZONE = 'Asia/Kolkata'

export function getDateKeyFromScheduledAt(scheduledAt: Date): string {
  // en-CA renders as YYYY-MM-DD; timeZone pins it to IST rather than UTC so
  // early-morning IST slots don't roll back to the previous calendar day.
  return scheduledAt.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

export function getDayOfWeekFromDate(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

// ─── Minimum notice ─────────────────────────────────────────────────────────
// How far ahead a booking must start: time for the garage to see and accept
// it, and for a doorstep crew to get there. Mirrored for the customer app in
// packages/core/src/booking-types.ts (MIN_NOTICE_MINS) — change both together.

const HOUR_MS = 60 * 60 * 1000

export type NoticeBookingType = 'dropin' | 'doorstep'

export const MIN_NOTICE_MS: Record<NoticeBookingType, number> = {
  dropin: 1 * HOUR_MS,
  doorstep: 3 * HOUR_MS,
}

/** The earliest a booking of this type may start, seen from `now`. */
export function earliestStartFor(type: NoticeBookingType, now: number = Date.now()): number {
  return now + MIN_NOTICE_MS[type]
}

/** Whether a start time gives enough notice. Exactly on the line counts. */
export function meetsMinNotice(
  scheduledAt: Date,
  type: NoticeBookingType,
  now: number = Date.now()
): boolean {
  return scheduledAt.getTime() >= earliestStartFor(type, now)
}

/**
 * Drops the slots that start too soon. Kept apart from computeAvailableSlots
 * on purpose: an empty list from that means "the job does not fit this day",
 * and a list emptied by notice must not be mistaken for it.
 */
export function filterByMinNotice(
  slots: string[],
  type: NoticeBookingType,
  now: number = Date.now()
): string[] {
  return slots.filter((slot) => meetsMinNotice(new Date(slot), type, now))
}

/** "Doorstep visits need at least 3 hours' notice." — for refusals. */
export function minNoticeMessage(type: NoticeBookingType): string {
  const hours = MIN_NOTICE_MS[type] / HOUR_MS
  const notice = hours === 1 ? "1 hour's notice" : `${hours} hours' notice`
  return type === 'doorstep'
    ? `Doorstep visits need at least ${notice}. Please pick a later time.`
    : `At-garage bookings need at least ${notice}. Please pick a later time.`
}
