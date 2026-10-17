import { bookingReference } from '../../lib/booking-ops.js'
import { MAX_RECEIVED_DAYS_BACK, resolveReceivedAt, type LoggedComplaintSource } from '../../lib/complaints.js'
import { AppError } from '../../lib/errors.js'
import type { LogComplaintInput } from './complaints.validation.js'

/**
 * A complaint the team logs from a call, a WhatsApp message, an email or a
 * visit: what the row will say, decided from what the service read. Pure
 * (the reads are passed in, the clock too), so the rules are unit-tested
 * without a database:
 *
 *   - The phone finds the account. With one, the complaint is theirs: it
 *     shows in their My complaints, with the team's answer in Updates, and
 *     their name is the account's. Without one, the name typed is kept with
 *     the phone, and no one else's account is touched.
 *   - A booking reference attaches the booking and its garage. With an
 *     account it must be one of theirs; without one, any booking with that
 *     reference (the caller may have booked from another phone). Two
 *     bookings with one reference are told apart by the account, or refused.
 *   - It was received now, or up to 7 days back (lib/complaints.ts
 *     resolveReceivedAt); the 24-hour and 7-day clock runs from then.
 */

/** A booking the typed reference may mean, as complaintsRepository reads it. */
export interface ReferencedBooking {
  id: string
  userId: string
  vendorId: string
  garageName: string | null
}

/** The one booking a typed reference means, or why it means none. */
export function pickBookingByReference<B extends { userId: string }>(
  candidates: B[],
  customerId: string | null
): { booking: B } | { refusal: 'not_found' | 'not_theirs' | 'ambiguous' } {
  if (candidates.length === 0) return { refusal: 'not_found' }
  if (customerId) {
    const theirs = candidates.filter((b) => b.userId === customerId)
    if (theirs.length === 1) return { booking: theirs[0]! }
    if (theirs.length === 0) return { refusal: 'not_theirs' }
    return { refusal: 'ambiguous' }
  }
  return candidates.length === 1 ? { booking: candidates[0]! } : { refusal: 'ambiguous' }
}

function bookingRefusal(refusal: 'not_found' | 'not_theirs' | 'ambiguous', reference: string): AppError {
  const ref = `#${reference.toUpperCase()}`
  switch (refusal) {
    case 'not_found':
      return new AppError(404, `No booking has the reference ${ref}.`, 'BOOKING_NOT_FOUND')
    case 'not_theirs':
      return new AppError(
        409,
        `Booking ${ref} belongs to another customer. Check the phone number or the reference.`,
        'COMPLAINT_BOOKING_NOT_THEIRS'
      )
    case 'ambiguous':
      return new AppError(
        409,
        `More than one booking starts ${ref}. Log it without the booking and say which one in the team's note.`,
        'COMPLAINT_BOOKING_AMBIGUOUS'
      )
  }
}

/** What the logged complaint's row will hold (complaintsRepository.insertLogged). */
export interface LoggedComplaintValues {
  userId: string | null
  customerName: string
  customerPhone: string
  bookingId: string | null
  bookingRef: string | null
  vendorId: string | null
  garageName: string | null
  category: LogComplaintInput['category']
  message: string
  source: LoggedComplaintSource
  receivedAt: Date
  loggedBy: string
}

/**
 * The row, or the AppError that refuses it. `account` is the user with the
 * typed phone (null when none); `bookings` are those whose reference is the
 * typed one (empty when none was typed).
 */
export function planLoggedComplaint(
  input: LogComplaintInput,
  read: { account: { id: string; name: string } | null; bookings: ReferencedBooking[] },
  now: Date
): LoggedComplaintValues {
  const received = resolveReceivedAt(input.receivedAt ? new Date(input.receivedAt) : null, now)
  if ('refusal' in received) {
    throw new AppError(
      400,
      received.refusal === 'too_old'
        ? `A complaint can be dated at most ${MAX_RECEIVED_DAYS_BACK} days back.`
        : "When it was received can't be in the future.",
      'COMPLAINT_RECEIVED_AT_INVALID'
    )
  }

  const { account } = read
  const customerName = (account?.name.trim() || input.customerName?.trim() || '').slice(0, 255)
  if (!customerName) {
    throw new AppError(
      400,
      "No account has this phone number, so type the customer's name.",
      'COMPLAINT_NAME_REQUIRED'
    )
  }

  let booking: ReferencedBooking | null = null
  if (input.bookingRef) {
    const picked = pickBookingByReference(read.bookings, account?.id ?? null)
    if ('refusal' in picked) throw bookingRefusal(picked.refusal, input.bookingRef)
    booking = picked.booking
  }

  return {
    userId: account?.id ?? null,
    customerName,
    customerPhone: input.phone,
    bookingId: booking?.id ?? null,
    bookingRef: booking ? bookingReference(booking.id) : null,
    vendorId: booking?.vendorId ?? null,
    garageName: booking?.garageName ?? null,
    category: input.category,
    message: input.message,
    source: input.source,
    receivedAt: received.at,
    loggedBy: input.loggedBy,
  }
}
