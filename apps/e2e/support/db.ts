/**
 * Direct database access for tests.
 *
 * Used for two things only:
 *   - reading the OTP a login just wrote, since there is no test inbox
 *   - asserting persisted state the UI does not show (payment rows, redemption
 *     counts, cancelledBy, the reschedule chain)
 *
 * It is not a fixture builder. Anything a user could create, the specs create
 * through the UI or the API, because a row inserted here would not prove the
 * product can produce it.
 */
import postgres from 'postgres'

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_URL is not set — playwright.config.ts loads .env.e2e')
}

export const sql = postgres(url, {
  max: 2,
  // The E2E database is local and has no TLS; the app's own client reads the
  // same `?sslmode=disable` switch.
  ssl: /[?&]sslmode=disable(&|$)/.test(url) ? false : 'require',
  onnotice: () => {},
})

/**
 * The most recent unexpired OTP for a phone.
 *
 * Deliberately not the BYPASS_PHONES shortcut in auth.service.ts: those are
 * three real production numbers, and a suite that depends on a production
 * bypass staying in place is a suite that breaks when someone rightly removes
 * it. Reading the row exercises the genuine flow and works for any number.
 */
export async function latestOtp(phone: string): Promise<string> {
  const rows = await sql<{ otp_code: string }[]>`
    select otp_code
      from otp_verifications
     where phone = ${phone}
       and verified = false
       and expires_at > now()
     order by created_at desc
     limit 1
  `

  if (rows.length === 0) {
    throw new Error(`No pending OTP for ${phone}. Was /auth/otp/send called?`)
  }

  return rows[0].otp_code
}

export type BookingRow = {
  id: string
  status: string
  amount: string
  subtotal_amount: string | null
  discount_amount: string | null
  discount_code: string | null
  discount_funded_by: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  cancelled_at: Date | null
  reschedule_count: number
  original_booking_id: string | null
  rescheduled_from_id: string | null
  vehicle_id: string
  scheduled_at: Date
}

export const getBooking = async (id: string): Promise<BookingRow | undefined> =>
  (await sql<BookingRow[]>`select * from bookings where id = ${id}`)[0]

export const getBookingItems = async (bookingId: string) =>
  sql<{ service_id: string; name: string; amount: string; duration_mins: number }[]>`
    select service_id, name, amount, duration_mins
      from booking_items where booking_id = ${bookingId} order by sort_order
  `

export const getPayment = async (bookingId: string) =>
  (await sql<{ status: string; amount: string; gateway_txn_id: string | null; paid_at: Date | null }[]>`
    select status, amount, gateway_txn_id, paid_at from payments where booking_id = ${bookingId}
  `)[0]

export const countRedemptions = async (bookingId: string): Promise<number> =>
  Number(
    (await sql<{ count: string }[]>`
      select count(*) from discount_redemptions where booking_id = ${bookingId}
    `)[0].count
  )

/**
 * How many times one customer has redeemed a code.
 *
 * Scoped to the customer on purpose. The per-booking count is not the
 * invariant that matters — rescheduling moves a redemption onto the new
 * booking, so a code legitimately changes hands while still having been spent
 * once — but a global count is not it either: other spec files share the seeded
 * codes with their own fixture customers, and a suite-wide total would couple
 * unrelated files together.
 */
export const countRedemptionsByCodeForUser = async (
  code: string,
  userId: string
): Promise<number> =>
  Number(
    (await sql<{ count: string }[]>`
      select count(*) from discount_redemptions
       where code = ${code} and user_id = ${userId}
    `)[0].count
  )

/** Bookings a customer owns, newest first — used to find what a flow just created. */
export const bookingsForUser = async (userId: string) =>
  sql<BookingRow[]>`
    select * from bookings where user_id = ${userId} order by created_at desc
  `

export const countBookingsForUser = async (userId: string): Promise<number> =>
  Number(
    (await sql<{ count: string }[]>`
      select count(*) from bookings where user_id = ${userId}
    `)[0].count
  )

/** The reschedule chain rooted at a booking, in the order it was written. */
export const rescheduleChain = async (rootId: string) =>
  sql<{ from_booking_id: string; to_booking_id: string; reason: string | null }[]>`
    select from_booking_id, to_booking_id, reason
      from booking_reschedules
     where original_booking_id = ${rootId}
     order by created_at
  `

export const countSupportAccessLogs = async (userId: string): Promise<number> =>
  Number(
    (await sql<{ count: string }[]>`
      select count(*) from internal_access_log where user_id = ${userId}
    `)[0].count
  )

export const closeDb = () => sql.end({ timeout: 5 })
