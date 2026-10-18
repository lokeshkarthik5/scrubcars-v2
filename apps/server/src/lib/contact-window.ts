/**
 * Contact windows (owner decision, 18 Oct 2026: "just hide phone numbers,
 * no need of chat"). A customer and a garage see each other's phone number
 * (and WhatsApp) only around the job — not days before, so they can't swap
 * numbers and book around Detlio, and not after, for the same reason. Before
 * and after, Detlio support is the way through.
 *
 * One rule for both directions: the customer's booking payload leaves out
 * the garage's phone and WhatsApp outside it, and the garage's leaves out
 * the customer's phone (bookings.service, toBookingResponse and
 * toVendorBookingResponse). Admin always sees both. Addresses are not
 * windowed: the customer needs the garage's address to plan the trip, and
 * the garage needs a doorstep or pickup address to plan the route.
 *
 * The window, for a booking scheduled at S (a pickup & drop job's S is its
 * pickup slot):
 *
 *   - opens at S − 2 hours, for every booking type;
 *   - pending or confirmed and not started: closes at S + 2 hours (a job
 *     nobody started two hours after its time is no-show territory, and
 *     Detlio sorts that out);
 *   - in progress: always open, however early it started or long it runs;
 *   - pickup & drop with the car collected (Picked up, At garage, the work,
 *     Out for delivery) and not yet delivered: always open — the garage has
 *     the customer's car;
 *   - completed: closes 1 hour after it was completed (pickup & drop: after
 *     Delivered, which completes it), so a forgotten key or a question about
 *     the work still gets through;
 *   - cancelled (any canceller, a no-show, or moved to a new time — the new
 *     booking has its own window): closed at once.
 *
 * Inside is opensAt <= now < closesAt. Every time is an instant (no IST
 * calendar arithmetic), so a slot just after midnight IST opens at 22:xx the
 * evening before and nothing depends on the server's timezone. Pure; the
 * clock is passed in. Words and the same numbers are twinned in
 * packages/core/src/contact-window.ts (contact-window.parity.test.ts).
 */

const HOUR_MS = 60 * 60 * 1000

/** The window opens this long before the slot starts. */
export const CONTACT_OPENS_HOURS_BEFORE = 2
/** A finished job's window stays open this long after completion. */
export const CONTACT_STAYS_HOURS_AFTER = 1
/** A booking nobody started closes this long after its slot's start. */
export const CONTACT_NOT_STARTED_HOURS_AFTER = 2

/** The facts the window reads, as a booking row carries them. */
export interface ContactWindowJob {
  status: string
  bookingType: string
  scheduledAt: Date
  completedAt?: Date | null
  cancelledAt?: Date | null
  pickedUpAt?: Date | null
  deliveredAt?: Date | null
}

/**
 * The window as both apps read it. `closesAt` is null while it is open with
 * no end yet (a job in progress, a car with the garage). `open` is the
 * server's answer for now; the payloads carry the numbers only when it is
 * true.
 */
export interface ContactWindow {
  opensAt: string
  closesAt: string | null
  open: boolean
}

const NOT_STARTED = new Set(['pending', 'confirmed'])

function plusHours(at: Date, hours: number): Date {
  return new Date(at.getTime() + hours * HOUR_MS)
}

/** When the window ends, or null while it has no end yet. */
function closesAtOf(job: ContactWindowJob, now: Date): Date | null {
  if (job.status === 'in_progress') return null
  if (job.status === 'completed') {
    // A pickup job completes at Delivered (both stamped together); either
    // will do. A row from before 0028 has neither: its slot stands in.
    const done = job.completedAt ?? job.deliveredAt ?? job.scheduledAt
    return plusHours(done, CONTACT_STAYS_HOURS_AFTER)
  }
  if (NOT_STARTED.has(job.status)) {
    // The car is with the garage between Picked up and Delivered.
    if (job.bookingType === 'pickup' && job.pickedUpAt && !job.deliveredAt) return null
    return plusHours(job.scheduledAt, CONTACT_NOT_STARTED_HOURS_AFTER)
  }
  // Cancelled, a no-show, or moved ('rescheduled' is the old way a move was
  // retired): closed from the moment it ended. A row with no time recorded
  // is closed as of now.
  return job.cancelledAt ?? now
}

/** Whether a job is live with no end to its window yet (always inside). */
function alwaysOpen(job: ContactWindowJob): boolean {
  if (job.status === 'in_progress') return true
  return (
    NOT_STARTED.has(job.status) &&
    job.bookingType === 'pickup' &&
    !!job.pickedUpAt &&
    !job.deliveredAt
  )
}

export function contactWindow(job: ContactWindowJob, now: Date): ContactWindow {
  const opensAt = plusHours(job.scheduledAt, -CONTACT_OPENS_HOURS_BEFORE)
  const closesAt = closesAtOf(job, now)
  const t = now.getTime()
  let open: boolean
  if (alwaysOpen(job)) open = true
  else if (job.status === 'completed') {
    // A job finished at all was being worked on, so it was inside; it stays
    // so for the hour after, even if the garage started early.
    open = closesAt !== null && t < closesAt.getTime()
  } else if (NOT_STARTED.has(job.status)) {
    open = t >= opensAt.getTime() && closesAt !== null && t < closesAt.getTime()
  } else open = false
  return {
    opensAt: opensAt.toISOString(),
    closesAt: closesAt ? closesAt.toISOString() : null,
    open,
  }
}
