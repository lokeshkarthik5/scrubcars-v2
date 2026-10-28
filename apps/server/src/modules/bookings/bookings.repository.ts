import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  bookingCharges,
  bookingItems,
  bookingRequests,
  bookingReschedules,
  bookingTimeProposals,
  bookings,
  discountRedemptions,
  discounts,
  jobPhotos,
  payments,
  receiptCounters,
  receiptNumbers,
  refundRecords,
  services,
  userAddresses,
  userVehicles,
  vendorClosures,
  vendorWorkingHours,
  vendors,
} from '../../db/schema.js'
import type { bookingStatusEnum, bookingTypeEnum, GatewayMode } from '../../db/schema.js'
import {
  addDaysToDateKey,
  getDateKeyFromScheduledAt,
  hasCapacity,
  istDayBounds,
  type BusyInterval,
} from '../../lib/slots.js'
import { DEFAULT_DOORSTEP_RADIUS_KM } from '../../lib/doorstep.js'
import { financialYearOf, formatReceiptSerial } from '../../lib/receipts.js'
import { DEFAULT_PICKUP_RADIUS_KM } from '../../lib/pickup.js'
import { calendarRange, garageRespondBy, type GarageCalendar } from '../../lib/response-deadline.js'
import { DISCOUNT_HELD } from '../discounts/discounts.predicates.js'
import { isInBin, vendorPageOpen } from '../vendors/vendors.predicates.js'

type BookingStatus = (typeof bookingStatusEnum.enumValues)[number]

/** A booking can be moved to a new time only while it is still on. */
const MOVABLE_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed']
type BookingType = (typeof bookingTypeEnum.enumValues)[number]

export type BookingRecord = typeof bookings.$inferSelect
export type PaymentRecord = typeof payments.$inferSelect

/** A pickup & drop booking's two handover codes (lib/pickup.ts newHandoverCodes). */
export interface HandoverCodes {
  pickupCode: string
  deliveryCode: string
}

/** Which of a pickup booking's two codes. */
export type HandoverCodeKind = 'pickup' | 'delivery'

// One line of a booking, already priced against the customer's vehicle. Name,
// amount and duration are snapshots — see booking_items in schema.ts.
export interface BookingItemInput {
  serviceId: string
  name: string
  amount: string
  durationMins: number
}

// The discount already resolved by discountsService, carried into the write so
// the booking, its payment and the redemption row land in one transaction.
export interface BookingDiscount {
  discountId: string
  code: string
  discountAmount: string
  fundedBy: 'platform' | 'vendor'
  perUserLimit: number | null
  totalUsageLimit: number | null
  /** The code's kind (discounts.source); a 'free_wash' may bring a checkout to ₹0 (0062). */
  source?: string
}

// Bookings that still lay claim to a vehicle. Cancelled and rescheduled ones
// released it; a completed one is already done and can't clash with a future
// slot.
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'in_progress',
]

// One car cannot be serviced in two places at once, so a vehicle may not hold
// overlapping active bookings — at any garage. This is separate from the
// garage's own capacity (checkGarageCanTake below): that one is about how many
// cars a garage can take, this one about where a single car can be.
//
// Runs inside the caller's transaction, after a lock on the vehicle, so two
// concurrent requests can't both read "no overlap" and both insert.
export async function findOverlappingVehicleBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  params: {
    vehicleId: string
    scheduledAt: Date
    // The whole booking's duration — the sum of its services, not one of them.
    durationMins: number
    excludeBookingId?: string
  }
) {
  const requestedEnd = new Date(
    params.scheduledAt.getTime() + params.durationMins * 60 * 1000
  )

  const [existing] = await tx
    .select({ id: bookings.id, scheduledAt: bookings.scheduledAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.vehicleId, params.vehicleId),
        inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
        params.excludeBookingId
          ? ne(bookings.id, params.excludeBookingId)
          : undefined,
        // Half-open overlap: existing starts before this one ends, and ends
        // after this one starts. Back-to-back bookings don't collide.
        //
        // The existing booking's end comes from its own `duration_mins`
        // snapshot. This used to join `services.duration_mins`, which meant a
        // vendor editing a service silently moved the window of every booking
        // already taken against it — and with several services per booking
        // there is no single service row to join to any more.
        sql`${bookings.scheduledAt} < ${requestedEnd.toISOString()}::timestamptz`,
        sql`${bookings.scheduledAt} + (${bookings.durationMins} * interval '1 minute') > ${params.scheduledAt.toISOString()}::timestamptz`
      )
    )
    .limit(1)

  return existing ?? null
}

// Shares DISCOUNT_HELD with discounts.repository.ts rather than restating it:
// the pre-check and this in-transaction re-check must apply the same rule, and
// two hand-copied predicates were one edit away from disagreeing.
export async function countHeldRedemptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  discountId: string,
  userId?: string
): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(discountRedemptions)
    .innerJoin(bookings, eq(bookings.id, discountRedemptions.bookingId))
    .innerJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(discountRedemptions.discountId, discountId),
        userId ? eq(discountRedemptions.userId, userId) : undefined,
        DISCOUNT_HELD
      )
    )

  return row?.value ?? 0
}

// Serialize writes for one discount so two simultaneous bookings can't both
// read "one use left" and both take it. Always taken *after* the vehicle lock,
// matching the ordering in rescheduleBookingWithPayment, so the two paths
// cannot deadlock against each other.
export async function lockDiscount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  discountId: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`discount:${discountId}`})::bigint)`
  )
}

// ─── Lock order ──────────────────────────────────────────────────────────────
//
// Every path that writes a booking takes its locks in this one order, and
// skips the ones it does not need:
//
//   1. vehicle:<id>                  lockVehicle
//   2. reschedule:<root booking id>  rescheduleBookingWithPayment only
//   3. the booking's own row         FOR UPDATE on the booking being moved
//                                    (rescheduleBookingWithPayment), FOR NO
//                                    KEY UPDATE on the booking being paid for
//                                    (settlePayment)
//   4. vendor-day:<vendor>:<date>    lockVendorDay, via checkGarageCanTake
//   5. discount:<id>                 lockDiscount
//  5a. gift-credit:<user>            lockCredit (gift-credit.repository),
//                                    consumeIntent only (0049): the
//                                    customer's Detlio credit, spent with the
//                                    booking. Taken on its own everywhere else
//                                    (redeeming, returning a booking's credit,
//                                    adjustments, the expiry sweep)
//   6. chain root's row, KEY SHARE   allocateReceiptNumber
//   7. receipt_counters row (<FY>)   allocateReceiptNumber, always last
//
// (consumeIntent locks its intent row FOR UPDATE before all of them. The
// job-photos:<booking> lock and the final bill's row lock are only ever taken
// on their own, never alongside these. The test-data reset, which deletes
// whole chains, keeps the same order: checkout rows, then booking rows (3),
// both FOR UPDATE in id order, then a restarting year's counter row (7),
// last; see data-reset.service.) Two transactions that take locks in
// the same order can wait on each other but never deadlock, so a new lock goes
// into this list rather than wherever it is first needed.
//
// The two row locks at the end are there because of the receipt counter.
// Every payment in the financial year queues on its row until the holder
// commits, so it is taken at the very end, after every other write, and
// nothing may be locked after it. But the receipt_numbers insert that follows
// it checks its foreign key, which takes KEY SHARE on the chain's first
// booking, and a reschedule holds the booking it moves FOR UPDATE while it
// waits for the vendor-day lock. Left to the foreign key, that lock would
// come after the counter and could close a cycle through vendor-day; so
// allocateReceiptNumber takes it itself, before the counter (6). And
// settlePayment locks the booking it is paying for (3) before vendor-day,
// where the reschedule takes its own, so the two paths queue on that row
// rather than each holding what the other wants. (KEY SHARE conflicts only
// with FOR UPDATE, so the foreign key checks a reschedule's insert makes on
// the chain after vendor-day wait on nobody that a payment holds.)

// ─── Receipt numbers ─────────────────────────────────────────────────────────

/** What allocateReceiptNumber did. */
export type ReceiptNumberAllocation =
  /** A new number, issued in this transaction. */
  | { kind: 'issued'; number: string }
  /** The chain already had one (a retry, a racing call): nothing was issued. */
  | { kind: 'existing'; number: string }
  /**
   * Numbering failed and was rolled back on its own, leaving the caller's
   * transaction as it was. The caller logs it; the receipt page tries again
   * the first time it is opened.
   */
  | { kind: 'failed'; error: unknown }

/** Thrown inside the savepoint to give back a number that lost a race. */
class ReceiptNumberTaken extends Error {}

/** The receipt number stored for a chain, read through the given connection. */
async function findReceiptNumberIn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn: PgTransaction<any, any, any>,
  rootBookingId: string
) {
  const [row] = await conn
    .select({ number: receiptNumbers.number })
    .from(receiptNumbers)
    .where(eq(receiptNumbers.rootBookingId, rootBookingId))
    .limit(1)
  return row?.number ?? null
}

/**
 * Issues the receipt number of a reschedule chain, once, inside the caller's
 * transaction: "DTL/26-27/000123" (see formatReceiptSerial).
 *
 * Called wherever a booking's own payment first goes through (settlePayment,
 * consumeIntent, markCashCollected) and, as a safety net, by the receipt read
 * (issueReceiptNumber). Not by a reschedule, which carries a payment that
 * already has its number, and not by a final bill, which is printed on the
 * booking's receipt under the booking's number.
 *
 * `rootBookingId` is the chain's first booking (originalBookingId ?? id), and
 * `issuedAt` when its payment went through (receiptIssuedAt): its financial
 * year is the number's.
 *
 * Gapless, which is why it is a counter row and not a SEQUENCE. The counter
 * is bumped in the caller's transaction, so a payment that rolls back gives
 * its number back. The UPDATE's row lock is held until commit, so this is the
 * last thing a transaction does (see the lock order above).
 *
 * Everything here, the first read included, runs in a savepoint, and every
 * error comes back as 'failed' rather than thrown, so that:
 *
 * - two first views of one receipt get one number: the second waits on the
 *   counter, then finds the chain numbered at the insert, and its bump is
 *   rolled back with the savepoint before the existing number is read;
 * - anything else going wrong here (a counter out of step with the numbers
 *   after a hand edit, a full year, the code deployed before migration 0030
 *   made the tables) rolls back only the numbering. An error outside a
 *   savepoint would abort the caller's whole transaction, and with it the
 *   record of money that has just been taken. The payment stands; the
 *   receipt page tries again later.
 */
export async function allocateReceiptNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  rootBookingId: string,
  issuedAt: Date
): Promise<ReceiptNumberAllocation> {
  try {
    return await tx.transaction(async (savepoint): Promise<ReceiptNumberAllocation> => {
      // Checked before the counter is touched, so a chain that has its number
      // never queues behind other payments for nothing.
      const existing = await findReceiptNumberIn(savepoint, rootBookingId)
      if (existing) return { kind: 'existing', number: existing }

      // Throws past 999999 below, and on a date that is not one here; both
      // land in the catch.
      const financialYear = financialYearOf(issuedAt)

      // The lock the insert's foreign key check would take, taken now so it
      // comes before the counter's (lock order, step 6). A reschedule may
      // hold this row; we wait for it here, holding nothing every payment
      // needs.
      await savepoint
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.id, rootBookingId))
        .for('key share')

      // The year's first receipt makes its counter row.
      await savepoint
        .insert(receiptCounters)
        .values({ financialYear, lastSeq: 0 })
        .onConflictDoNothing()

      const [counter] = await savepoint
        .update(receiptCounters)
        .set({ lastSeq: sql`${receiptCounters.lastSeq} + 1` })
        .where(eq(receiptCounters.financialYear, financialYear))
        .returning({ lastSeq: receiptCounters.lastSeq })

      // Throws past 999999, which rolls the bump back with the savepoint.
      const formatted = formatReceiptSerial(financialYear, counter.lastSeq)

      const [inserted] = await savepoint
        .insert(receiptNumbers)
        .values({
          rootBookingId,
          financialYear,
          seq: counter.lastSeq,
          number: formatted,
          issuedAt,
        })
        .onConflictDoNothing({ target: receiptNumbers.rootBookingId })
        .returning({ number: receiptNumbers.number })

      // Someone numbered this chain while we waited on the counter. Throwing
      // rolls our bump back, so the serial we were handed is not skipped.
      if (!inserted) throw new ReceiptNumberTaken()
      return { kind: 'issued', number: inserted.number }
    })
  } catch (error) {
    if (!(error instanceof ReceiptNumberTaken)) return { kind: 'failed', error }
    // The winner's number, read once the savepoint is rolled back. In a
    // savepoint of its own, for the same reason as above.
    try {
      const winner = await tx.transaction((savepoint) =>
        findReceiptNumberIn(savepoint, rootBookingId)
      )
      if (winner) return { kind: 'existing', number: winner }
      return { kind: 'failed', error }
    } catch (readError) {
      return { kind: 'failed', error: readError }
    }
  }
}

// Serialises concurrent bookings for one vehicle. Taken before the overlap
// check in every path that creates a booking.
export async function lockVehicle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  vehicleId: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`vehicle:${vehicleId}`})::bigint)`
  )
}

// Serialises bookings for one garage on one IST day, so two customers paying
// for the last free bay at the same moment cannot both read "one left" and
// both be written. Keyed on the day rather than the slot because the daily cap
// and overlapping jobs of different lengths both make every slot of the day
// depend on every other.
export async function lockVendorDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  vendorId: string,
  date: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`vendor-day:${vendorId}:${date}`})::bigint)`
  )
}

// A booking holds a share of the garage while it is still on and has been
// paid for — the same bookings the garage sees in its portal (see
// listBookingsForVendor). An unpaid legacy row must not be able to squat a bay
// the garage cannot even see. A function rather than a constant so every query
// builds its own subquery.
export function holdsCapacity() {
  return and(
    inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
    inArray(
      bookings.id,
      db
        .select({ bookingId: payments.bookingId })
        .from(payments)
        .where(inArray(payments.status, ['paid', 'collected']))
    )
  )
}

/**
 * The bookings that take up this garage's room on an IST day: every one
 * starting that day, plus the day before's in case one runs past midnight.
 * Read with whichever executor the caller is in — the slot list reads it
 * outside a transaction, the booking write inside one.
 */
export async function listCapacityHolders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: PgTransaction<any, any, any> | typeof db,
  params: { vendorId: string; date: string; excludeBookingId?: string }
): Promise<BusyInterval[]> {
  const from = istDayBounds(addDaysToDateKey(params.date, -1)).start
  const to = istDayBounds(params.date).end

  const rows = await executor
    .select({ start: bookings.scheduledAt, durationMins: bookings.durationMins })
    .from(bookings)
    .where(
      and(
        eq(bookings.vendorId, params.vendorId),
        holdsCapacity(),
        params.excludeBookingId
          ? ne(bookings.id, params.excludeBookingId)
          : undefined,
        sql`${bookings.scheduledAt} >= ${from.toISOString()}::timestamptz`,
        sql`${bookings.scheduledAt} < ${to.toISOString()}::timestamptz`
      )
    )

  return rows
}

/** Why a garage would not take a booking at the moment it is written. */
export type GarageRefusal = 'paused' | 'closed' | 'slot_full'

/**
 * The garage-side checks, re-run where the booking row is written.
 *
 * The service checked all of this before any payment, but minutes of Razorpay
 * sheet can pass in between: the owner may pause, mark the day a holiday, or
 * another customer may take the last bay. Done under the vendor-day lock, so
 * two writes for the same garage and day queue up and the second one counts
 * the first. `excludeBookingId` is the booking being moved by a reschedule,
 * which still holds its old time until it is cancelled in the same
 * transaction.
 */
export async function checkGarageCanTake(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  params: {
    vendorId: string
    scheduledAt: Date
    durationMins: number
    excludeBookingId?: string
  }
): Promise<GarageRefusal | null> {
  const date = getDateKeyFromScheduledAt(params.scheduledAt)
  await lockVendorDay(tx, params.vendorId, date)

  const [vendor] = await tx
    .select({
      bays: vendors.bays,
      jobsPerDay: vendors.jobsPerDay,
      bookingsPausedAt: vendors.bookingsPausedAt,
      deletedAt: vendors.deletedAt,
    })
    .from(vendors)
    .where(eq(vendors.id, params.vendorId))
    .limit(1)

  // A garage in the Bin is refused as a paused one is: it takes nothing new,
  // and money that lands for it anyway becomes the same refund-due failure
  // (garage_paused) rather than a booking nobody will do.
  if (!vendor || vendor.bookingsPausedAt || isInBin(vendor)) return 'paused'

  const [closure] = await tx
    .select({ id: vendorClosures.id })
    .from(vendorClosures)
    .where(
      and(
        eq(vendorClosures.vendorId, params.vendorId),
        eq(vendorClosures.date, date)
      )
    )
    .limit(1)

  if (closure) return 'closed'

  const busy = await listCapacityHolders(tx, {
    vendorId: params.vendorId,
    date,
    excludeBookingId: params.excludeBookingId,
  })

  return hasCapacity(params.scheduledAt, {
    durationMins: params.durationMins,
    busy,
    bays: vendor.bays,
    jobsPerDay: vendor.jobsPerDay,
  })
    ? null
    : 'slot_full'
}

/**
 * What decides when a garage is open between `from` and a slot: its pause,
 * its weekly hours and its holidays in that range (lib/response-deadline.ts).
 * Plain reads, no locks: taken inside the booking write's transaction so the
 * deadline is written with the payment, after the locks it already holds.
 */
export async function readGarageCalendar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executor: PgTransaction<any, any, any> | typeof db,
  vendorId: string,
  from: Date,
  scheduledAt: Date
): Promise<GarageCalendar> {
  const { first, last } = calendarRange(from, scheduledAt)
  const [vendor] = await executor
    .select({ bookingsPausedAt: vendors.bookingsPausedAt })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1)
  const hours = await executor
    .select({
      dayOfWeek: vendorWorkingHours.dayOfWeek,
      openTime: vendorWorkingHours.openTime,
      closeTime: vendorWorkingHours.closeTime,
      isClosed: vendorWorkingHours.isClosed,
    })
    .from(vendorWorkingHours)
    .where(eq(vendorWorkingHours.vendorId, vendorId))
  const closures = await executor
    .select({ date: vendorClosures.date })
    .from(vendorClosures)
    .where(
      and(
        eq(vendorClosures.vendorId, vendorId),
        sql`${vendorClosures.date} >= ${first}::date`,
        sql`${vendorClosures.date} <= ${last}::date`
      )
    )
  return {
    pausedAt: vendor?.bookingsPausedAt ?? null,
    hours,
    closures: closures.map((row) => row.date),
  }
}

/**
 * The garage's deadline to answer a booking that becomes paid and pending
 * at `from` (0042): read its calendar, then the pure rule. Called by every
 * write that makes a paid pending booking — consumeIntent, settlePayment
 * and a customer's reschedule — in its own transaction.
 */
export async function respondByFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  params: { vendorId: string; from: Date; scheduledAt: Date; windowMins: number }
): Promise<Date> {
  const calendar = await readGarageCalendar(tx, params.vendorId, params.from, params.scheduledAt)
  return garageRespondBy({
    from: params.from,
    scheduledAt: params.scheduledAt,
    windowMins: params.windowMins,
    calendar,
  }).respondBy
}

// Line items in the order the customer added them. Declared once because
// every booking read needs the same shape — a list that came back ordered
// differently in one place would show a different "first service" there.
//
// Each line also carries its service's pricing type, read from the service
// row: whether a final bill can be raised depends on it (see
// lib/final-bill.ts), and the garage's job card has to know before it offers
// one.
const BOOKING_ITEMS = {
  orderBy: [asc(bookingItems.sortOrder)],
  with: { service: { columns: { pricingType: true as const } } },
}

// The job's photos, oldest first within each stage, and its bills, newest
// first so the live one is found before any it replaced. Loaded where a
// single job is shown in full: the booking page and the garage's job list.
const JOB_RECORDS = {
  photos: { orderBy: [asc(jobPhotos.createdAt), asc(jobPhotos.id)] },
  charges: { orderBy: [desc(bookingCharges.createdAt)] },
  // The garage's time suggestions (0041), newest first: the live one, or
  // how the last one ended.
  timeProposals: { orderBy: [desc(bookingTimeProposals.createdAt)], limit: 3 },
}

/**
 * No time suggestion of the garage's is open on the booking (0041). The
 * garage's Accept and Decline carry it in their conditional write: while it
 * waits for the customer's answer, the garage withdraws it first.
 */
function noOpenProposal() {
  return sql`not exists (
    select 1 from ${bookingTimeProposals}
     where ${bookingTimeProposals.bookingId} = ${bookings.id}
       and ${bookingTimeProposals.status} = 'open'
  )`
}

/**
 * No extra work on the booking is still waiting for the customer (0041).
 * Completing a job (Mark completed, Delivered) carries it in its write.
 */
function noOpenExtraWork() {
  return sql`not exists (
    select 1 from ${bookingCharges}
     where ${bookingCharges.bookingId} = ${bookings.id}
       and ${bookingCharges.kind} = 'extra_work'
       and ${bookingCharges.status} = 'due'
  )`
}

/**
 * The photo standard holds at the moment of writing (0045): Detlio waived it
 * on this booking, or the garage has at least `min` photos of `stage`. Start
 * and Complete (and pickup & drop's Out for delivery and Delivered) carry it
 * in their conditional write while the standard is on for the garage, so a
 * photo removed between the check and the write cannot slip a job past it.
 */
function garagePhotosAtLeast(guard: { stage: 'before' | 'after'; min: number }) {
  return sql`(${bookings.photosWaivedAt} is not null or (
    select count(*) from ${jobPhotos}
     where ${jobPhotos.bookingId} = ${bookings.id}
       and ${jobPhotos.stage} = ${guard.stage}
       and ${jobPhotos.uploadedByRole} = 'garage'
  ) >= ${guard.min})`
}

/**
 * The garage's time to answer has not run out at `at` (0042): no deadline,
 * or one still ahead. Accept carries it in its conditional write while
 * AUTO_CANCEL_UNANSWERED is on, so an Accept and the cron's auto-cancel
 * racing on one booking leave exactly one winner: both are conditional on
 * `status = 'pending'`, and whichever writes second finds it changed.
 */
function responseTimeLeft(at: Date) {
  return sql`(${bookings.respondBy} is null or ${bookings.respondBy} > ${at.toISOString()}::timestamptz)`
}

/**
 * Closes what waits on a booking that is being cancelled or moved, in the
 * caller's transaction, after the booking's own row (the lock order): its
 * unpaid extra work is withdrawn ('booking_closed'), and an open time
 * suggestion is closed. A payment already on its way for that extra work
 * then lands on a withdrawn request and is refunded (booking-charges
 * settleCaptured), like a final bill's.
 */
export async function closeWaitingOnBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  bookingId: string,
  at: Date
) {
  await tx
    .update(bookingCharges)
    .set({ status: 'cancelled', cancelReason: 'booking_closed', cancelledAt: at, updatedAt: at })
    .where(
      and(
        eq(bookingCharges.bookingId, bookingId),
        eq(bookingCharges.kind, 'extra_work'),
        eq(bookingCharges.status, 'due')
      )
    )
  await tx
    .update(bookingTimeProposals)
    .set({ status: 'closed', resolvedAt: at })
    .where(and(eq(bookingTimeProposals.bookingId, bookingId), eq(bookingTimeProposals.status, 'open')))
}

/** Thrown inside a cancel's transaction to roll it back with nothing written. */
class NothingCancelled extends Error {}

export const bookingsRepository = {
  /**
   * Is this garage willing to travel to this point?
   *
   * The bound is the vendor's own coverage, not a radius the customer chose —
   * the question a doorstep booking asks is "will you come to me", and the
   * garage is the only party that can answer it.
   *
   * Two shapes, in priority order:
   *   1. A drawn polygon (`doorstep_area`), when the vendor set one. Real
   *      coverage is rarely circular — a river or a highway cuts it.
   *   2. Otherwise `doorstep_radius_km`, the simple default.
   *   3. A garage that left the radius empty covers DEFAULT_DOORSTEP_RADIUS_KM
   *      (lib/doorstep.ts). The radius is optional, and the Doorstep list
   *      measures with the same default — a garage listed for an address
   *      must not then refuse to book it.
   *
   * PostGIS calls are schema-qualified because the extension lives in `gis`;
   * see drizzle/0019_add_geo.sql.
   */
  async isWithinDoorstepRadius(
    vendorId: string,
    lat: number,
    lng: number
  ): Promise<boolean> {
    const rows = await db.execute<{ covered: boolean }>(sql`
      SELECT CASE
               WHEN v.doorstep_area IS NOT NULL
               THEN gis.ST_Covers(
                      v.doorstep_area,
                      gis.ST_SetSRID(gis.ST_MakePoint(${lng}, ${lat}), 4326)::gis.geography
                    )
               ELSE gis.ST_DWithin(
                      v.geo,
                      gis.ST_SetSRID(gis.ST_MakePoint(${lng}, ${lat}), 4326)::gis.geography,
                      COALESCE(v.doorstep_radius_km, ${DEFAULT_DOORSTEP_RADIUS_KM}) * 1000,
                      false
                    )
             END AS covered
        FROM vendors v
       WHERE v.id = ${vendorId} AND v.geo IS NOT NULL
    `)

    // No row means the garage has no pin at all, which cannot be verified and
    // therefore cannot be booked — not "covered by default".
    return Array.from(rows)[0]?.covered === true
  },

  /**
   * Will this garage collect a car from this point? Pickup & drop (0037)
   * asks the doorstep question with the garage's own pickup radius, measured
   * from its pin; an empty radius is DEFAULT_PICKUP_RADIUS_KM. No drawn area:
   * that is the doorstep crew's coverage, not the pickup driver's.
   */
  async isWithinPickupRadius(vendorId: string, lat: number, lng: number): Promise<boolean> {
    const rows = await db.execute<{ covered: boolean }>(sql`
      SELECT gis.ST_DWithin(
               v.geo,
               gis.ST_SetSRID(gis.ST_MakePoint(${lng}, ${lat}), 4326)::gis.geography,
               COALESCE(v.pickup_radius_km, ${DEFAULT_PICKUP_RADIUS_KM}) * 1000,
               false
             ) AS covered
        FROM vendors v
       WHERE v.id = ${vendorId} AND v.geo IS NOT NULL
    `)
    // No pin, no pickup: there is nothing to measure from.
    return Array.from(rows)[0]?.covered === true
  },

  /** Hides Home's "Rate your wash" prompt for a booking; the first time stands. */
  async dismissReviewPrompt(bookingId: string) {
    await db
      .update(bookings)
      .set({ reviewPromptDismissedAt: sql`coalesce(${bookings.reviewPromptDismissedAt}, now())` })
      .where(eq(bookings.id, bookingId))
  },

  /**
   * Which of these bookings the customer moved to a new time: the ones
   * another booking was rescheduled from. A moved booking reads cancelled
   * with its payment still 'paid', but that payment went with the move.
   */
  async findMovedBookingIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await db
      .select({ id: bookings.rescheduledFromId })
      .from(bookings)
      .where(inArray(bookings.rescheduledFromId, ids))
    return new Set(rows.flatMap((row) => (row.id ? [row.id] : [])))
  },

  findBookingById(id: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: {
        user: true,
        vendor: true,
        // `service` is the deprecated first-item pointer, still loaded for the
        // readers that have not moved to `items` yet.
        service: true,
        items: BOOKING_ITEMS,
        vehicle: true,
        payment: true,
        review: true,
        ...JOB_RECORDS,
      },
    })
  },

  /**
   * Every refund recorded against a booking (its own payment and its bills),
   * oldest first. For the customer's receipt, which lists each one, and the
   * booking page's "Refund of ₹X started" line; only the columns those may
   * show are read — never who recorded it or the team's note. A refund
   * through Razorpay that failed moved no money and is left out (0036).
   */
  listRefundRecordsForBooking(bookingId: string) {
    return db
      .select({
        kind: refundRecords.kind,
        targetId: refundRecords.targetId,
        amount: refundRecords.amount,
        refundRef: refundRecords.refundRef,
        recordedAt: refundRecords.recordedAt,
        source: refundRecords.source,
        gatewayStatus: refundRecords.gatewayStatus,
      })
      .from(refundRecords)
      .where(
        and(
          eq(refundRecords.bookingId, bookingId),
          sql`${refundRecords.gatewayStatus} IS DISTINCT FROM 'failed'`
        )
      )
      .orderBy(asc(refundRecords.recordedAt), asc(refundRecords.id))
  },

  listBookingsForUser(
    userId: string,
    filters: { status?: BookingStatus; bookingType?: BookingType }
  ) {
    const conditions = [eq(bookings.userId, userId)]

    if (filters.status) {
      conditions.push(eq(bookings.status, filters.status))
    }

    if (filters.bookingType) {
      conditions.push(eq(bookings.bookingType, filters.bookingType))
    }

    return db.query.bookings.findMany({
      where: and(...conditions),
      with: {
        vendor: true,
        service: true,
        items: BOOKING_ITEMS,
        vehicle: true,
        payment: true,
      },
      orderBy: [desc(bookings.scheduledAt)],
    })
  },

  /**
   * A garage only ever sees work that has been paid for.
   *
   * Bookings used to be written before Razorpay opened, so an abandoned
   * checkout put a real-looking request in front of a vendor who could accept,
   * start and complete a job nobody had paid for. New bookings are only created
   * once the money lands, but this filter stays as the backstop — it also
   * retires the unpaid rows already in the database, without a data migration.
   *
   * `collected` counts alongside `paid` because markCompleted settles legacy
   * cash bookings to `collected`; DISCOUNT_REALIZED already treats both as
   * settled.
   *
   * `refunded` counts too: ops marking a full refund (0029) is the only thing
   * that writes it, and only on a cancelled booking that was paid. Leaving it
   * out would make a declined booking or the garage's own no-show vanish from
   * its Cancelled tab the moment the customer got their money back. Nothing
   * here can accept it or let it hold capacity — those checks still ask for
   * `paid` themselves.
   */
  listBookingsForVendor(
    vendorId: string,
    status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  ) {
    const conditions = [
      eq(bookings.vendorId, vendorId),
      inArray(
        bookings.id,
        db
          .select({ bookingId: payments.bookingId })
          .from(payments)
          .where(inArray(payments.status, ['paid', 'collected', 'refunded']))
      ),
    ]

    if (status) {
      conditions.push(eq(bookings.status, status))
    }

    return db.query.bookings.findMany({
      where: and(...conditions),
      with: {
        user: true,
        // The garage's own row: its job cards name it in the WhatsApp they
        // start with the customer, and use its city for unpinned addresses.
        vendor: true,
        service: true,
        items: BOOKING_ITEMS,
        vehicle: true,
        payment: true,
        review: true,
        ...JOB_RECORDS,
      },
      orderBy: [desc(bookings.scheduledAt)],
    })
  },

  createBookingWithPayment(data: {
    userId: string
    vendorId: string
    // The services being booked, in the order the customer picked them. The
    // first one is also written to the deprecated `bookings.service_id`.
    items: BookingItemInput[]
    vehicleId: string
    bookingType: BookingType
    scheduledAt: Date
    durationMins: number
    // Pre-discount total: the sum of the item amounts.
    subtotalAmount: string
    // What is actually charged: subtotalAmount - discount.discountAmount.
    amount: string
    paymentMethod: 'online' | 'cash'
    lat?: number | null
    lng?: number | null
    address?: string | null
    discount?: BookingDiscount | null
    // Pickup & drop only: the customer's codes, made by the service.
    handoverCodes?: HandoverCodes | null
  }) {
    return db.transaction(async (tx) => {
      await lockVehicle(tx, data.vehicleId)

      const clash = await findOverlappingVehicleBooking(tx, {
        vehicleId: data.vehicleId,
        scheduledAt: data.scheduledAt,
        durationMins: data.durationMins,
      })

      if (clash) {
        return {
          booking: null,
          payment: null,
          vehicleClash: clash,
          garageRefusal: null,
          discountUnavailable: false as const,
        }
      }

      const garageRefusal = await checkGarageCanTake(tx, {
        vendorId: data.vendorId,
        scheduledAt: data.scheduledAt,
        durationMins: data.durationMins,
      })

      if (garageRefusal) {
        return {
          booking: null,
          payment: null,
          vehicleClash: null,
          garageRefusal,
          discountUnavailable: false as const,
        }
      }

      // The service already resolved the code, but that read is outside this
      // transaction. Re-check the limits here, under the lock, so the last use
      // of a code can only be taken once. This is only meaningful because
      // DISCOUNT_HELD counts unpaid bookings — a predicate that waited for
      // payment would be false for every booking currently in flight.
      if (data.discount) {
        await lockDiscount(tx, data.discount.discountId)

        const { discountId, totalUsageLimit, perUserLimit } = data.discount

        if (totalUsageLimit !== null) {
          const used = await countHeldRedemptions(tx, discountId)
          if (used >= totalUsageLimit) {
            return {
              booking: null,
              payment: null,
              vehicleClash: null,
              garageRefusal: null,
              discountUnavailable: true as const,
            }
          }
        }

        if (perUserLimit !== null) {
          const usedByUser = await countHeldRedemptions(tx, discountId, data.userId)
          if (usedByUser >= perUserLimit) {
            return {
              booking: null,
              payment: null,
              vehicleClash: null,
              garageRefusal: null,
              discountUnavailable: true as const,
            }
          }
        }
      }

      const [booking] = await tx
        .insert(bookings)
        .values({
          userId: data.userId,
          vendorId: data.vendorId,
          serviceId: data.items[0].serviceId,
          vehicleId: data.vehicleId,
          bookingType: data.bookingType,
          scheduledAt: data.scheduledAt,
          durationMins: data.durationMins,
          subtotalAmount: data.subtotalAmount,
          amount: data.amount,
          discountAmount: data.discount?.discountAmount ?? '0.00',
          discountId: data.discount?.discountId ?? null,
          discountCode: data.discount?.code ?? null,
          discountFundedBy: data.discount?.fundedBy ?? null,
          paymentMethod: data.paymentMethod,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          address: data.address ?? null,
          pickupCode: data.handoverCodes?.pickupCode ?? null,
          deliveryCode: data.handoverCodes?.deliveryCode ?? null,
        })
        .returning()

      await tx.insert(bookingItems).values(
        data.items.map((item, index) => ({
          bookingId: booking.id,
          serviceId: item.serviceId,
          name: item.name,
          amount: item.amount,
          durationMins: item.durationMins,
          sortOrder: index,
        }))
      )

      const [payment] = await tx
        .insert(payments)
        .values({
          bookingId: booking.id,
          gateway: 'razorpay',
          amount: data.amount,
          status: 'pending',
        })
        .returning()

      if (data.discount) {
        await tx.insert(discountRedemptions).values({
          discountId: data.discount.discountId,
          bookingId: booking.id,
          userId: data.userId,
          code: data.discount.code,
          discountAmount: data.discount.discountAmount,
        })
      }

      return {
        booking,
        payment,
        vehicleClash: null,
        garageRefusal: null,
        discountUnavailable: false as const,
      }
    })
  },

  rescheduleBookingWithPayment(data: {
    sourceBookingId: string
    rootBookingId: string
    userId: string
    vendorId: string
    // A move copies the lines verbatim, prices and all — it is not a re-quote.
    items: BookingItemInput[]
    vehicleId: string
    bookingType: BookingType
    newScheduledAt: Date
    durationMins: number
    /**
     * The source's status when the service checked the rules. The move goes
     * ahead only if it is still that: a garage accept landing in between
     * would otherwise let a confirmed booking skip the 2-hour cutoff.
     */
    expectedStatus: BookingStatus
    // A reschedule is a move, not a re-price: these are copied verbatim from
    // the booking being moved.
    subtotalAmount: string
    /** An accepted request's travel fee (0062), carried by a move. */
    travelFee?: string
    amount: string
    discountAmount: string
    discountId: string | null
    discountCode: string | null
    discountFundedBy: 'platform' | 'vendor' | null
    paymentMethod: 'online' | 'cash'
    lat: number | null
    lng: number | null
    address: string | null
    // A pickup booking's codes, carried to the new booking unchanged: the
    // customer may already have them written down.
    handoverCodes: HandoverCodes | null
    sourcePayment: {
      gateway: 'razorpay'
      gatewayTxnId: string | null
      gatewayMode: GatewayMode | null
      amount: string
      /** The part paid with Detlio credit (0049), carried with the payment. */
      creditAmount?: string | null
      currency: string
      status: 'pending' | 'paid' | 'failed' | 'refunded' | 'collected'
      paidAt: Date | null
    } | null
    reason: string | null
    maxReschedules: number
    // The chain's "Test" mark (0032), carried to the new booking so the
    // chain stays marked as a whole.
    markedTestAt?: Date | null
    markedTestBy?: string | null
    /**
     * Set when the customer is picking one of the garage's suggested times
     * (0041). The move is then the garage's doing: it is not counted toward
     * the customer's reschedules, it needs the suggestion still open with
     * this time on it, and the new booking is written already accepted —
     * by the person who suggested it — since the garage offered the time.
     */
    proposal?: {
      id: string
      acceptedBy: string | null
      reason: string
    } | null
    /**
     * GARAGE_RESPONSE_MINUTES (0042). A customer's move writes a paid
     * booking back to pending, so the garage gets a fresh deadline from the
     * moment of the move; a time the garage suggested is accepted already
     * and has none, nor does an unpaid one.
     */
    responseWindowMins: number
  }) {
    return db.transaction(async (tx) => {
      // Vehicle lock first, matching the order used when creating a booking, so
      // the two paths can never deadlock against each other.
      await lockVehicle(tx, data.vehicleId)

      // Then lock the reschedule chain, not the vendor's day: the remaining
      // race is two concurrent moves of the same booking both reading a stale
      // count and busting the cap. Keying this on vendor+date used to miss that
      // race entirely whenever the two moves targeted different days.
      const lockKey = `reschedule:${data.rootBookingId}`
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`
      )

      // The booking being moved must still be movable now, not just when the
      // service read it: a garage decline or a customer cancel can land in
      // between. Locked, so those wait for this move and then find nothing
      // left to change.
      const [source] = await tx
        .select({ status: bookings.status, pickedUpAt: bookings.pickedUpAt })
        .from(bookings)
        .where(eq(bookings.id, data.sourceBookingId))
        .for('update')

      // A pickup job whose car the garage has collected in the meantime is
      // not movable any more either (lib/pickup.ts customerChangeRefusal).
      if (
        !source ||
        !MOVABLE_STATUSES.includes(source.status) ||
        source.status !== data.expectedStatus ||
        source.pickedUpAt !== null
      ) {
        return {
          booking: null,
          payment: null,
          capReached: false as const,
          vehicleClash: null,
          garageRefusal: null,
          stateChanged: true as const,
          proposalGone: false as const,
        }
      }

      // A pick of a suggested time: the suggestion's row next, after the
      // booking's own (the lock order). It must still be open, in time, and
      // offer this exact time; the garage withdrawing it, or the cron
      // expiring it, waits for this move or is waited for.
      const now = new Date()
      if (data.proposal) {
        const [proposal] = await tx
          .select({
            status: bookingTimeProposals.status,
            slots: bookingTimeProposals.slots,
            expiresAt: bookingTimeProposals.expiresAt,
          })
          .from(bookingTimeProposals)
          .where(
            and(
              eq(bookingTimeProposals.id, data.proposal.id),
              eq(bookingTimeProposals.bookingId, data.sourceBookingId)
            )
          )
          .for('update')
        const offered = proposal?.slots.some(
          (slot) => new Date(slot).getTime() === data.newScheduledAt.getTime()
        )
        if (!proposal || proposal.status !== 'open' || proposal.expiresAt <= now || !offered) {
          return {
            booking: null,
            payment: null,
            capReached: false as const,
            vehicleClash: null,
            garageRefusal: null,
            stateChanged: false as const,
            proposalGone: true as const,
          }
        }
      }

      // Cap check inside the transaction (race-safe): the number of moves the
      // customer made in this chain is the authoritative reschedule count. A
      // pick of the garage's suggested time is the garage's move (0041): it
      // is neither counted nor capped.
      const [{ value: existing }] = await tx
        .select({ value: count() })
        .from(bookingReschedules)
        .where(
          and(
            eq(bookingReschedules.originalBookingId, data.rootBookingId),
            isNull(bookingReschedules.proposalId)
          )
        )

      if (!data.proposal && existing >= data.maxReschedules) {
        return {
          booking: null,
          payment: null,
          capReached: true as const,
          vehicleClash: null,
          garageRefusal: null,
          stateChanged: false as const,
          proposalGone: false as const,
        }
      }

      // The booking being moved is still active at this point (it is cancelled
      // further down), so it must be excluded or it would clash with itself
      // whenever the new time overlaps the old one.
      const clash = await findOverlappingVehicleBooking(tx, {
        vehicleId: data.vehicleId,
        scheduledAt: data.newScheduledAt,
        durationMins: data.durationMins,
        excludeBookingId: data.sourceBookingId,
      })

      if (clash) {
        return {
          booking: null,
          payment: null,
          capReached: false as const,
          vehicleClash: clash,
          garageRefusal: null,
          stateChanged: false as const,
          proposalGone: false as const,
        }
      }

      // The garage's side, under the vendor-day lock (after the chain lock —
      // see the lock order above). The source booking is excluded for the same
      // reason as in the vehicle check: it still holds the old time until it
      // is cancelled below, and moving a job 30 minutes later must not be
      // refused for clashing with itself.
      const garageRefusal = await checkGarageCanTake(tx, {
        vendorId: data.vendorId,
        scheduledAt: data.newScheduledAt,
        durationMins: data.durationMins,
        excludeBookingId: data.sourceBookingId,
      })

      if (garageRefusal) {
        return {
          booking: null,
          payment: null,
          capReached: false as const,
          vehicleClash: null,
          garageRefusal,
          stateChanged: false as const,
          proposalGone: false as const,
        }
      }

      // The garage's deadline to answer the move (0042): plain reads, after
      // every lock this write takes.
      const respondBy =
        !data.proposal && data.sourcePayment?.status === 'paid'
          ? await respondByFor(tx, {
              vendorId: data.vendorId,
              from: now,
              scheduledAt: data.newScheduledAt,
              windowMins: data.responseWindowMins,
            })
          : null

      const [booking] = await tx
        .insert(bookings)
        .values({
          userId: data.userId,
          vendorId: data.vendorId,
          serviceId: data.items[0].serviceId,
          vehicleId: data.vehicleId,
          bookingType: data.bookingType,
          scheduledAt: data.newScheduledAt,
          respondBy,
          durationMins: data.durationMins,
          // Back to pending: the garage agreed to the old time, not this
          // one, so it has to accept the move. A time the garage suggested
          // itself is accepted already (0041).
          status: data.proposal ? 'confirmed' : 'pending',
          acceptedAt: data.proposal ? now : null,
          acceptedBy: data.proposal?.acceptedBy ?? null,
          subtotalAmount: data.subtotalAmount,
          travelFee: data.travelFee ?? '0',
          amount: data.amount,
          discountAmount: data.discountAmount,
          discountId: data.discountId,
          discountCode: data.discountCode,
          discountFundedBy: data.discountFundedBy,
          paymentMethod: data.paymentMethod,
          lat: data.lat,
          lng: data.lng,
          address: data.address,
          pickupCode: data.handoverCodes?.pickupCode ?? null,
          deliveryCode: data.handoverCodes?.deliveryCode ?? null,
          originalBookingId: data.rootBookingId,
          rescheduledFromId: data.sourceBookingId,
          // The customer's own moves so far (the garage's do not count).
          rescheduleCount: data.proposal ? existing : existing + 1,
          markedTestAt: data.markedTestAt ?? null,
          markedTestBy: data.markedTestBy ?? null,
        })
        .returning()

      await tx.insert(bookingItems).values(
        data.items.map((item, index) => ({
          bookingId: booking.id,
          serviceId: item.serviceId,
          name: item.name,
          amount: item.amount,
          durationMins: item.durationMins,
          sortOrder: index,
        }))
      )

      // Carry the prepaid payment to the new booking (no re-charge).
      const [payment] = await tx
        .insert(payments)
        .values({
          bookingId: booking.id,
          gateway: data.sourcePayment?.gateway ?? 'razorpay',
          gatewayTxnId: data.sourcePayment?.gatewayTxnId ?? null,
          gatewayMode: data.sourcePayment?.gatewayMode ?? null,
          amount: data.sourcePayment?.amount ?? data.amount,
          // The credit part moves with the money (0049); the chain's ledger
          // rows name its first booking, which a move never changes.
          creditAmount: data.sourcePayment?.creditAmount ?? '0.00',
          currency: data.sourcePayment?.currency ?? 'INR',
          status: data.sourcePayment?.status ?? 'pending',
          paidAt: data.sourcePayment?.paidAt ?? null,
        })
        .returning()

      // Move any redemption onto the new booking. This is not bookkeeping
      // tidiness: the source booking is cancelled below, and a redemption
      // attached to a cancelled booking stops counting as consumed — the
      // customer would get their allowance back while still holding the
      // discounted slot. The unique booking_id makes this a move, not a copy.
      await tx
        .update(discountRedemptions)
        .set({ bookingId: booking.id })
        .where(eq(discountRedemptions.bookingId, data.sourceBookingId))

      // Retire the source booking. It is cancelled outright (not left in a
      // 'rescheduled' limbo state) and carries the usual cancellation
      // metadata, so it reads as cancelled in the customer/vendor/admin lists.
      // No refund is owed: the prepaid payment was carried to the new booking
      // above.
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledBy: 'user',
          cancelledAt: now,
          cancellationReason:
            data.proposal?.reason ?? data.reason ?? 'Rescheduled to a new slot by the customer',
        })
        .where(eq(bookings.id, data.sourceBookingId))

      // Unpaid extra work stays with the job that was moved away from, and
      // goes with it; an open suggestion on it is answered (below) or closed.
      if (data.proposal) {
        await tx
          .update(bookingTimeProposals)
          .set({
            status: 'accepted',
            chosenSlot: data.newScheduledAt,
            resultBookingId: booking.id,
            resolvedAt: now,
          })
          .where(eq(bookingTimeProposals.id, data.proposal.id))
      }
      await closeWaitingOnBooking(tx, data.sourceBookingId, now)

      await tx.insert(bookingReschedules).values({
        originalBookingId: data.rootBookingId,
        fromBookingId: data.sourceBookingId,
        toBookingId: booking.id,
        userId: data.userId,
        reason: data.proposal?.reason ?? data.reason,
        proposalId: data.proposal?.id ?? null,
      })

      return {
        booking,
        payment,
        capReached: false as const,
        vehicleClash: null,
        garageRefusal: null,
        stateChanged: false as const,
        proposalGone: false as const,
      }
    })
  },

  // `actor` records which *person* moved the job — with a team, "who accepted
  // this?" is otherwise unanswerable. It is the authenticated user, never the
  // tenant.
  /**
   * Moves a booking on only from the status the caller saw (`from`). Two
   * people acting on one booking at once — a garage accepting while the
   * customer cancels — would otherwise both succeed, the second overwriting
   * the first. An empty result means someone else got there first.
   */
  //
  // `step` stamps when it happened (accepted_at, started_at, completed_at) in
  // the same conditional write, so a time is only ever recorded for the move
  // that actually won.
  //
  // `guards` (0041): accepting needs no open time suggestion, completing no
  // extra work still waiting for the customer, both checked in the write.
  // `responseTimeLeftAt` (0042): accepting, while AUTO_CANCEL_UNANSWERED is
  // on, needs the garage's deadline still ahead at that moment.
  updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
    from: BookingStatus,
    actor?: {
      acceptedBy?: string
      completedBy?: string
      acceptedAt?: Date
      startedAt?: Date
      completedAt?: Date
    },
    guards: {
      noOpenProposal?: boolean
      noOpenExtraWork?: boolean
      responseTimeLeftAt?: Date
      // 0045: the photo standard, while it is on for the garage.
      garagePhotos?: { stage: 'before' | 'after'; min: number }
    } = {}
  ) {
    return db
      .update(bookings)
      .set({ status, ...actor })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.status, from),
          guards.noOpenProposal ? noOpenProposal() : undefined,
          guards.noOpenExtraWork ? noOpenExtraWork() : undefined,
          guards.responseTimeLeftAt ? responseTimeLeft(guards.responseTimeLeftAt) : undefined,
          guards.garagePhotos ? garagePhotosAtLeast(guards.garagePhotos) : undefined
        )
      )
      .returning()
  },

  /**
   * The pending-digest cron's auto-cancel (0042, AUTO_CANCEL_UNANSWERED): a
   * paid booking the garage did not answer by its deadline is cancelled as
   * the garage's (`cancelled_by = 'vendor'`, so lib/refunds.ts owes a full
   * refund and AUTO_REFUNDS treats it as a garage decline), stamped
   * `response_missed_at`, with NOT_ACCEPTED_REASON.
   *
   * One conditional write, everything re-checked at the moment of writing:
   * still pending, still paid, the deadline passed, no suggested times
   * waiting for the customer, the car not collected. A garage Accept racing
   * it is conditional on `pending` too (and on the deadline still ahead,
   * responseTimeLeft), so one of the two finds the row changed: exactly one
   * winner. The booking's own row is the only lock, taken first; what waits
   * on it is closed after it in the same transaction (the lock order).
   * Empty when it no longer qualifies.
   */
  cancelNotAcceptedInTime(bookingId: string, reason: string, at: Date) {
    return db.transaction(async (tx) => {
      // The booking's row first, on its own. A suggestion of other times
      // only locks this row (insertProposal) without changing it, so an
      // UPDATE that had queued behind it would go ahead on its old snapshot
      // and miss the suggestion just written. Holding the lock first, the
      // write below is a new statement that sees it.
      await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId)).for('update')
      const [cancelled] = await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledBy: 'vendor',
          cancellationReason: reason,
          cancelledAt: at,
          responseMissedAt: at,
        })
        .where(
          and(
            eq(bookings.id, bookingId),
            eq(bookings.status, 'pending'),
            isNotNull(bookings.respondBy),
            sql`${bookings.respondBy} <= ${at.toISOString()}::timestamptz`,
            isNull(bookings.pickedUpAt),
            noOpenProposal(),
            sql`exists (
              select 1 from ${payments}
               where ${payments.bookingId} = ${bookings.id}
                 and ${payments.status} = 'paid'
            )`
          )
        )
        .returning()
      if (!cancelled) return []
      await closeWaitingOnBooking(tx, bookingId, at)
      return [cancelled]
    })
  },

  /**
   * The garage withdrew its suggested times (0041) and the booking waits for
   * an answer again: the suggestion is withdrawn and, with it, the booking's
   * deadline moved to `respondBy` (lib/response-deadline.ts afterWithdraw:
   * at least 15 minutes from now), only while the suggestion is still open
   * and in time and the booking still pending. The booking's row first,
   * then the suggestion's (the lock order). Empty when it was no longer open.
   */
  withdrawProposal(params: { proposalId: string; bookingId: string; at: Date; respondBy: Date | null }) {
    return db
      .transaction(async (tx) => {
        const [booking] = await tx
          .select({ status: bookings.status })
          .from(bookings)
          .where(eq(bookings.id, params.bookingId))
          .for('update')
        const [withdrawn] = await tx
          .update(bookingTimeProposals)
          .set({ status: 'withdrawn', resolvedAt: params.at })
          .where(
            and(
              eq(bookingTimeProposals.id, params.proposalId),
              eq(bookingTimeProposals.bookingId, params.bookingId),
              eq(bookingTimeProposals.status, 'open'),
              sql`${bookingTimeProposals.expiresAt} > ${params.at.toISOString()}::timestamptz`
            )
          )
          .returning()
        if (!withdrawn) return []
        if (booking?.status === 'pending' && params.respondBy) {
          await tx
            .update(bookings)
            .set({ respondBy: params.respondBy })
            .where(and(eq(bookings.id, params.bookingId), eq(bookings.status, 'pending')))
        }
        return [withdrawn]
      })
  },

  /**
   * Cancels only from the status the caller saw; empty if it changed. Never
   * a pickup job whose car the garage has collected: the customer and the
   * garage cannot call it off with the car away from home (Detlio can, from
   * admin). A pickup landing between the check and this write is caught here.
   */
  //
  // In one transaction with closeWaitingOnBooking (0041): unpaid extra work
  // is withdrawn and an open time suggestion closed with it. The garage's
  // Decline (`cancelledBy` 'vendor') also needs no open suggestion: it
  // withdraws its suggested times first. `proposalOutcome` is the
  // suggestion's own end — the customer said none work, or nobody answered
  // in time — which cancels as the garage's decline: the suggestion must
  // still be open, and is marked with how it ended.
  cancelBooking(
    bookingId: string,
    cancelledBy: 'user' | 'vendor',
    from: BookingStatus,
    reason?: string | null,
    proposalOutcome?: { proposalId: string; status: 'declined' | 'expired' } | null
  ) {
    return db
      .transaction(async (tx) => {
        const at = new Date()
        const [cancelled] = await tx
          .update(bookings)
          .set({
            status: 'cancelled',
            cancelledBy,
            cancellationReason: reason ?? null,
            cancelledAt: at,
          })
          .where(
            and(
              eq(bookings.id, bookingId),
              eq(bookings.status, from),
              isNull(bookings.pickedUpAt),
              cancelledBy === 'vendor' && !proposalOutcome ? noOpenProposal() : undefined
            )
          )
          .returning()
        if (!cancelled) return []

        // The suggestion's row after the booking's own (the lock order).
        if (proposalOutcome) {
          const [ended] = await tx
            .update(bookingTimeProposals)
            .set({ status: proposalOutcome.status, resolvedAt: at })
            .where(
              and(
                eq(bookingTimeProposals.id, proposalOutcome.proposalId),
                eq(bookingTimeProposals.bookingId, bookingId),
                eq(bookingTimeProposals.status, 'open')
              )
            )
            .returning({ id: bookingTimeProposals.id })
          // Withdrawn or answered in between: undo the cancel, the booking
          // stays as it is.
          if (!ended) throw new NothingCancelled()
        }
        await closeWaitingOnBooking(tx, bookingId, at)
        return [cancelled]
      })
      .catch((error: unknown) => {
        if (error instanceof NothingCancelled) return []
        throw error
      })
  },

  // ─── Pickup & drop steps (0037) ────────────────────────────────────────────
  //
  // Each step is one conditional update from the state the service checked
  // (lib/pickup.ts pickupStepRefusal): the status, the step's own column
  // still empty and the one before it set. Two phones pressing the same
  // step, or a cancel landing in between, leave one winner; an empty result
  // means someone else got there first. The code steps also require the
  // code's tries to be under the cap at the moment of writing, unless
  // Detlio is confirming it from admin.

  /** Picked up: the garage has the car. Confirmed, not yet picked up. */
  markPickedUp(
    bookingId: string,
    params: { at: Date; maxAttempts: number | null; overrideBy?: string | null }
  ) {
    return db
      .update(bookings)
      .set({ pickedUpAt: params.at, pickupOverrideBy: params.overrideBy ?? null })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.bookingType, 'pickup'),
          eq(bookings.status, 'confirmed'),
          isNull(bookings.pickedUpAt),
          params.maxAttempts === null
            ? undefined
            : sql`${bookings.pickupCodeAttempts} < ${params.maxAttempts}`
        )
      )
      .returning()
  },

  /** At garage: the car has arrived. Confirmed and picked up. */
  markAtGarage(bookingId: string, at: Date) {
    return db
      .update(bookings)
      .set({ atGarageAt: at })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.bookingType, 'pickup'),
          eq(bookings.status, 'confirmed'),
          isNotNull(bookings.pickedUpAt),
          isNull(bookings.atGarageAt)
        )
      )
      .returning()
  },

  /** Out for delivery: the work is done and the car is on its way back. */
  markOutForDelivery(bookingId: string, at: Date, garagePhotos?: { stage: 'before' | 'after'; min: number }) {
    return db
      .update(bookings)
      .set({ outForDeliveryAt: at })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.bookingType, 'pickup'),
          eq(bookings.status, 'in_progress'),
          isNull(bookings.outForDeliveryAt),
          // 0045: the car leaves only with its after photos.
          garagePhotos ? garagePhotosAtLeast(garagePhotos) : undefined
        )
      )
      .returning()
  },

  /**
   * Delivered: the customer has the car back, which completes the booking,
   * stamped as markCompleted stamps any job.
   */
  markDelivered(
    bookingId: string,
    params: {
      at: Date
      completedBy: string | null
      maxAttempts: number | null
      overrideBy?: string | null
      // 0045: the photo standard, while it is on for the garage.
      garagePhotos?: { stage: 'before' | 'after'; min: number }
    }
  ) {
    return db
      .update(bookings)
      .set({
        status: 'completed',
        deliveredAt: params.at,
        completedAt: params.at,
        completedBy: params.completedBy,
        deliveryOverrideBy: params.overrideBy ?? null,
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.bookingType, 'pickup'),
          eq(bookings.status, 'in_progress'),
          isNotNull(bookings.outForDeliveryAt),
          isNull(bookings.deliveredAt),
          // Delivered completes the job: not with extra work still waiting
          // for the customer (0041).
          noOpenExtraWork(),
          params.garagePhotos ? garagePhotosAtLeast(params.garagePhotos) : undefined,
          params.maxAttempts === null
            ? undefined
            : sql`${bookings.deliveryCodeAttempts} < ${params.maxAttempts}`
        )
      )
      .returning()
  },

  /**
   * Counts a wrong code, only while under the cap, so racing guesses can
   * never take more than the cap between them. Returns the new count, or
   * null when the code was already locked.
   */
  async recordWrongCode(
    bookingId: string,
    kind: HandoverCodeKind,
    maxAttempts: number
  ): Promise<number | null> {
    const column = kind === 'pickup' ? bookings.pickupCodeAttempts : bookings.deliveryCodeAttempts
    const [row] = await db
      .update(bookings)
      .set(
        kind === 'pickup'
          ? { pickupCodeAttempts: sql`${bookings.pickupCodeAttempts} + 1` }
          : { deliveryCodeAttempts: sql`${bookings.deliveryCodeAttempts} + 1` }
      )
      .where(and(eq(bookings.id, bookingId), sql`${column} < ${maxAttempts}`))
      .returning({ attempts: column })
    return row ? row.attempts : null
  },

  /**
   * A cash booking's money, collected when the garage completes the job: the
   * moment its payment goes through, so its receipt number is issued in the
   * same transaction (allocateReceiptNumber). Never over a payment that has
   * already gone through, whose number and paid_at are already on a receipt.
   */
  markCashCollected(params: {
    bookingId: string
    // The first booking of its reschedule chain, which the number belongs to.
    rootBookingId: string
    collectedAt: Date
  }) {
    return db.transaction(async (tx) => {
      const [payment] = await tx
        .update(payments)
        .set({ status: 'collected', paidAt: params.collectedAt })
        .where(
          and(
            eq(payments.bookingId, params.bookingId),
            notInArray(payments.status, ['paid', 'collected', 'refunded'])
          )
        )
        .returning()

      if (!payment) return { payment: null, receipt: null }

      const receipt = await allocateReceiptNumber(
        tx,
        params.rootBookingId,
        params.collectedAt
      )
      return { payment, receipt }
    })
  },

  /** The receipt number of a reschedule chain, if one has been issued. */
  async findReceiptNumber(rootBookingId: string): Promise<string | null> {
    const [row] = await db
      .select({ number: receiptNumbers.number })
      .from(receiptNumbers)
      .where(eq(receiptNumbers.rootBookingId, rootBookingId))
      .limit(1)
    return row?.number ?? null
  },

  /**
   * Issues a chain's receipt number on its own, for the receipt read when
   * none was issued as the payment went through (a path that missed it, a
   * row written by hand). Its own transaction, so the receipt number's two
   * locks (the chain's first booking, then the counter) are the only ones it
   * takes.
   */
  issueReceiptNumber(rootBookingId: string, issuedAt: Date) {
    return db.transaction((tx) => allocateReceiptNumber(tx, rootBookingId, issuedAt))
  },

  // Archived cars are excluded: one the customer has removed from their garage
  // must not be bookable again, even if a stale client still holds its id.
  // Past bookings read their vehicle through the relation, by primary key, so
  // they still render the car they were for.
  findVehicleForUser(userId: string, vehicleId: string) {
    return db.query.userVehicles.findFirst({
      where: and(
        eq(userVehicles.id, vehicleId),
        eq(userVehicles.userId, userId),
        isNull(userVehicles.archivedAt)
      ),
    })
  },

  findAddressForUser(userId: string, addressId: string) {
    return db.query.userAddresses.findFirst({
      where: and(
        eq(userAddresses.id, addressId),
        eq(userAddresses.userId, userId)
      ),
    })
  },

  findVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: eq(vendors.id, id),
    })
  },

  /** The garage page's own rule (vendorPageOpen): a garage in the Bin takes no booking. */
  findPublicVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: vendorPageOpen(id),
    })
  },

  /** A code's kind (discounts.source), for the receipt's free-wash line (0062). */
  async findDiscountSource(discountId: string): Promise<string | null> {
    const [row] = await db.select({ source: discounts.source }).from(discounts).where(eq(discounts.id, discountId)).limit(1)
    return row?.source ?? null
  },

  /** A request a checkout confirms (customer reach, 0062). */
  findRequest(id: string) {
    return db.query.bookingRequests.findFirst({ where: eq(bookingRequests.id, id) })
  },

  /** The garage's holiday on this IST date, if it marked one. */
  findClosure(vendorId: string, date: string) {
    return db.query.vendorClosures.findFirst({
      where: and(
        eq(vendorClosures.vendorId, vendorId),
        eq(vendorClosures.date, date)
      ),
    })
  },

  /**
   * The garage's bookings that are still on for an IST day, for the warning
   * shown when it marks that day a holiday. Same rule as capacity: on and
   * paid for, which is also what the garage's own job list shows.
   */
  listActiveBookingsForVendorOn(vendorId: string, date: string) {
    const { start, end } = istDayBounds(date)

    return db.query.bookings.findMany({
      where: and(
        eq(bookings.vendorId, vendorId),
        holdsCapacity(),
        sql`${bookings.scheduledAt} >= ${start.toISOString()}::timestamptz`,
        sql`${bookings.scheduledAt} < ${end.toISOString()}::timestamptz`
      ),
      with: {
        user: true,
        vendor: true,
        service: true,
        items: BOOKING_ITEMS,
        vehicle: true,
        payment: true,
      },
      orderBy: [asc(bookings.scheduledAt)],
    })
  },

  /**
   * How many of those there are on each IST day in [from, to), keyed by date.
   * Days with none are absent.
   */
  async countActiveBookingsByDate(vendorId: string, from: string, to: string) {
    const rows = await db
      .select({
        date: sql<string>`to_char(${bookings.scheduledAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.vendorId, vendorId),
          holdsCapacity(),
          sql`${bookings.scheduledAt} >= ${istDayBounds(from).start.toISOString()}::timestamptz`,
          sql`${bookings.scheduledAt} < ${istDayBounds(to).start.toISOString()}::timestamptz`
        )
      )
      .groupBy(sql`1`)

    return new Map(rows.map((row) => [row.date, row.count]))
  },

  /** See listCapacityHolders: the bookings taking up the garage's room that day. */
  listCapacityHolders(params: {
    vendorId: string
    date: string
    excludeBookingId?: string
  }) {
    return listCapacityHolders(db, params)
  },

  /**
   * The requested services, restricted to this vendor. Returns whatever
   * matched — the caller compares against what it asked for, so it can name
   * the service that was missing rather than failing the whole cart blindly.
   */
  findServicesForVendor(vendorId: string, serviceIds: string[]) {
    return db.query.services.findMany({
      where: and(
        eq(services.vendorId, vendorId),
        inArray(services.id, serviceIds)
      ),
    })
  },
}
