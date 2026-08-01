export type BookedRange = {
  start: Date
  end: Date
}

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

function rangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB
}

export function computeAvailableSlots(input: {
  date: string
  openTime: string
  closeTime: string
  intervalMins: number
  isClosed: boolean
  serviceDurationMins: number
  bookedRanges: BookedRange[]
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

    const overlapsBooking = input.bookedRanges.some((booking) =>
      rangesOverlap(blockStart, blockEnd, booking.start, booking.end)
    )

    if (!overlapsBooking) {
      available.push(blockStart.toISOString())
    }
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
