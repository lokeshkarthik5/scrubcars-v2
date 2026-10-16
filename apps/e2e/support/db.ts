/**
 * Direct database access for tests.
 *
 * Used for three things only:
 *   - reading the OTP a login just wrote, since there is no test inbox
 *   - forgetting a phone's earlier codes, so a spec may send it another (see
 *     forgetOtps)
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
export async function latestOtp(phone: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs

  // Polled, not read once. The row is written by a request the browser fires,
  // so a caller that reads immediately after clicking "Send OTP" races it —
  // and for an unrecognised number the client makes *two* calls, trying
  // `login` first and falling back to `register` on the 404.
  for (;;) {
    const rows = await sql<{ otp_code: string }[]>`
      select otp_code
        from otp_verifications
       where phone = ${phone}
         and verified = false
         and expires_at > now()
       order by created_at desc
       limit 1
    `

    if (rows.length > 0) return rows[0].otp_code

    if (Date.now() > deadline) {
      throw new Error(`No pending OTP for ${phone} after ${timeoutMs}ms. Was /auth/otp/send called?`)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Forgets every login code a phone has been sent, so a spec can send it
 * another straight away.
 *
 * The API allows one code per phone every 30 seconds and five an hour
 * (apps/server/src/lib/otp.ts), counted from these rows. Right for people; a
 * wall for a suite that logs a fixture in during global setup and then again
 * in a spec a few seconds later, or is re-run locally within the hour. Specs
 * that test the limit itself call this first, for the opposite reason: to
 * start from a clean count.
 */
export const forgetOtps = (phone: string) =>
  sql`delete from otp_verifications where phone = ${phone}`

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
  /** Only on an admin cancellation: 'customer' | 'garage' | 'detlio'. */
  cancelled_on_behalf_of: string | null
  /** Who didn't turn up, when ops marked a no-show: 'customer' | 'garage'. */
  no_show: string | null
  no_show_marked_at: Date | null
  reschedule_count: number
  original_booking_id: string | null
  rescheduled_from_id: string | null
  /** Who at the garage accepted it; null until someone does (and after a move). */
  accepted_by: string | null
  /** When each job step happened, stamped by the garage's own action. */
  accepted_at: Date | null
  started_at: Date | null
  completed_at: Date | null
  vehicle_id: string
  scheduled_at: Date
  booking_type: string
  /**
   * The doorstep snapshot: where the garage was told to go, copied off the
   * saved address at write time rather than joined. All three are null for
   * drop-in, where the customer comes to the garage.
   */
  address: string | null
  lat: number | null
  lng: number | null
}

export const getBooking = async (id: string): Promise<BookingRow | undefined> =>
  (await sql<BookingRow[]>`select * from bookings where id = ${id}`)[0]

export const getBookingItems = async (bookingId: string) =>
  sql<{ service_id: string; name: string; amount: string; duration_mins: number }[]>`
    select service_id, name, amount, duration_mins
      from booking_items where booking_id = ${bookingId} order by sort_order
  `

export type PaymentRow = {
  status: string
  amount: string
  gateway_txn_id: string | null
  paid_at: Date | null
  /** What ops has recorded giving back (0029); null until then. */
  refunded_amount: string | null
  refund_ref: string | null
  refunded_at: Date | null
  refunded_by: string | null
  refund_note: string | null
}

export const getPayment = async (bookingId: string) =>
  (await sql<PaymentRow[]>`
    select status, amount, gateway_txn_id, paid_at,
           refunded_amount, refund_ref, refunded_at, refunded_by, refund_note
      from payments where booking_id = ${bookingId}
  `)[0]

/**
 * The receipt number issued for a reschedule chain (receipt_numbers, keyed by
 * the chain's first booking), or null while none has been.
 */
export const getReceiptNumber = async (rootBookingId: string) =>
  (await sql<{ number: string; financial_year: string; seq: number }[]>`
    select number, financial_year, seq
      from receipt_numbers where root_booking_id = ${rootBookingId}
  `)[0] ?? null

/**
 * Each financial year's receipt counter beside the numbers issued in it. One
 * statement, so one snapshot: specs in other files issue receipts at the same
 * time, and two separate reads could straddle one of them.
 *
 * A number the test-data reset voided (receipt_number_voids, 0032) was
 * issued too: it stays on record and is never given out again, so it counts
 * toward the year's series like any other.
 */
export const receiptCounters = async () =>
  sql<{ financial_year: string; last_seq: number | null; issued: number; max_seq: number }[]>`
    select financial_year,
           c.last_seq,
           coalesce(n.issued, 0) as issued,
           coalesce(n.max_seq, 0) as max_seq
      from (select financial_year, count(*)::int as issued, max(seq)::int as max_seq
              from (select financial_year, seq from receipt_numbers
                    union all
                    select financial_year, seq from receipt_number_voids) issued
             group by financial_year) n
      full join receipt_counters c using (financial_year)
     order by financial_year
  `

/**
 * The Razorpay mode (gateway_mode, 0032) recorded on a booking's payment and
 * on the checkout it was made from, if any. The test-data reset tells test
 * money from real money by it, so every path that opens an order or copies a
 * payment has to carry it; null is what a missed copy looks like.
 */
export const gatewayModes = async (bookingId: string) =>
  (await sql<{ payment: string | null; intent: string | null }[]>`
    select p.gateway_mode as payment,
           (select i.gateway_mode from booking_intents i where i.booking_id = p.booking_id) as intent
      from payments p where p.booking_id = ${bookingId}
  `)[0]

/** A checkout's status and what has been refunded on it. */
export const getIntent = async (intentId: string) =>
  (await sql<{
    status: string
    payment_ref: string | null
    refunded_amount: string | null
    refund_ref: string | null
    refund_note: string | null
  }[]>`
    select status, payment_ref, refunded_amount, refund_ref, refund_note
      from booking_intents where id = ${intentId}
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

/** The ops team's internal notes on a booking, newest first. */
export const bookingNotes = async (bookingId: string) =>
  sql<{ author: string; body: string }[]>`
    select author, body from booking_notes
     where booking_id = ${bookingId}
     order by created_at desc
  `

export const countSupportAccessLogs = async (userId: string): Promise<number> =>
  Number(
    (await sql<{ count: string }[]>`
      select count(*) from internal_access_log where user_id = ${userId}
    `)[0].count
  )

export const closeDb = () => sql.end({ timeout: 5 })

export type FinalBillRow = {
  id: string
  status: 'due' | 'paid' | 'cancelled' | 'not_needed'
  total_amount: string
  paid_before: string
  amount_due: string
  lines: Array<{ description: string; amount: string }>
  gateway_order_id: string | null
  gateway_payment_id: string | null
  paid_at: Date | null
}

/** A booking's final bills, newest first — the live one and any it replaced. */
export const getFinalBills = async (bookingId: string) =>
  sql<FinalBillRow[]>`
    select id, status, total_amount, paid_before, amount_due, lines,
           gateway_order_id, gateway_payment_id, paid_at
      from booking_charges where booking_id = ${bookingId} order by created_at desc
  `

/** A job's photos, oldest first. */
export const getJobPhotos = async (bookingId: string) =>
  sql<{ id: string; stage: 'before' | 'after'; url: string; storage_key: string }[]>`
    select id, stage, url, storage_key
      from job_photos where booking_id = ${bookingId} order by created_at
  `
