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
