import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  bookingCharges,
  bookingItems,
  bookingReschedules,
  bookings,
  discountRedemptions,
  jobPhotos,
  payments,
  services,
  userAddresses,
  userVehicles,
  vendorClosures,
  vendors,
} from '../../db/schema.js'
import type { bookingStatusEnum, bookingTypeEnum } from '../../db/schema.js'
import {
  addDaysToDateKey,
  getDateKeyFromScheduledAt,
  hasCapacity,
  istDayBounds,
  type BusyInterval,
} from '../../lib/slots.js'
import { DISCOUNT_HELD } from '../discounts/discounts.predicates.js'

type BookingStatus = (typeof bookingStatusEnum.enumValues)[number]

/** A booking can be moved to a new time only while it is still on. */
const MOVABLE_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed']
type BookingType = (typeof bookingTypeEnum.enumValues)[number]

export type BookingRecord = typeof bookings.$inferSelect
export type PaymentRecord = typeof payments.$inferSelect

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
// Every path that writes a booking takes its transaction-scoped advisory locks
// in this one order, and skips the ones it does not need:
//
//   1. vehicle:<id>                  lockVehicle
//   2. reschedule:<root booking id>  rescheduleBookingWithPayment only
//   3. vendor-day:<vendor>:<date>    lockVendorDay, via checkGarageCanTake
//   4. discount:<id>                 lockDiscount
//
// (consumeIntent locks its intent row FOR UPDATE before all of them. The
// job-photos:<booking> lock and the final bill's row lock are only ever taken
// on their own, never alongside these.) Two transactions that take locks in
// the same order can wait on each other but never deadlock, so a new lock goes
// into this list rather than wherever it is first needed.

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
    })
    .from(vendors)
    .where(eq(vendors.id, params.vendorId))
    .limit(1)

  if (!vendor || vendor.bookingsPausedAt) return 'paused'

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
}

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
   * A vendor with neither has not opted into travelling anywhere, which the
   * COALESCE to 0 expresses precisely.
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
                      COALESCE(v.doorstep_radius_km, 0) * 1000,
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
    amount: string
    discountAmount: string
    discountId: string | null
    discountCode: string | null
    discountFundedBy: 'platform' | 'vendor' | null
    paymentMethod: 'online' | 'cash'
    lat: number | null
    lng: number | null
    address: string | null
    sourcePayment: {
      gateway: 'razorpay'
      gatewayTxnId: string | null
      amount: string
      currency: string
      status: 'pending' | 'paid' | 'failed' | 'refunded' | 'collected'
      paidAt: Date | null
    } | null
    reason: string | null
    maxReschedules: number
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
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, data.sourceBookingId))
        .for('update')

      if (
        !source ||
        !MOVABLE_STATUSES.includes(source.status) ||
        source.status !== data.expectedStatus
      ) {
        return {
          booking: null,
          payment: null,
          capReached: false as const,
          vehicleClash: null,
          garageRefusal: null,
          stateChanged: true as const,
        }
      }

      // Cap check inside the transaction (race-safe): the number of successful
      // moves for this chain is the authoritative reschedule count.
      const [{ value: existing }] = await tx
        .select({ value: count() })
        .from(bookingReschedules)
        .where(eq(bookingReschedules.originalBookingId, data.rootBookingId))

      if (existing >= data.maxReschedules) {
        return {
          booking: null,
          payment: null,
          capReached: true as const,
          vehicleClash: null,
          garageRefusal: null,
          stateChanged: false as const,
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
          scheduledAt: data.newScheduledAt,
          durationMins: data.durationMins,
          // Always back to pending: the garage agreed to the old time, not
          // this one, so it has to accept the move.
          status: 'pending',
          subtotalAmount: data.subtotalAmount,
          amount: data.amount,
          discountAmount: data.discountAmount,
          discountId: data.discountId,
          discountCode: data.discountCode,
          discountFundedBy: data.discountFundedBy,
          paymentMethod: data.paymentMethod,
          lat: data.lat,
          lng: data.lng,
          address: data.address,
          originalBookingId: data.rootBookingId,
          rescheduledFromId: data.sourceBookingId,
          rescheduleCount: existing + 1,
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
          amount: data.sourcePayment?.amount ?? data.amount,
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
          cancelledAt: new Date(),
          cancellationReason:
            data.reason ?? 'Rescheduled to a new slot by the customer',
        })
        .where(eq(bookings.id, data.sourceBookingId))

      await tx.insert(bookingReschedules).values({
        originalBookingId: data.rootBookingId,
        fromBookingId: data.sourceBookingId,
        toBookingId: booking.id,
        userId: data.userId,
        reason: data.reason,
      })

      return {
        booking,
        payment,
        capReached: false as const,
        vehicleClash: null,
        garageRefusal: null,
        stateChanged: false as const,
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
    }
  ) {
    return db
      .update(bookings)
      .set({ status, ...actor })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, from)))
      .returning()
  },

  /** Cancels only from the status the caller saw; empty if it changed. */
  cancelBooking(
    bookingId: string,
    cancelledBy: 'user' | 'vendor',
    from: BookingStatus,
    reason?: string | null
  ) {
    return db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledBy,
        cancellationReason: reason ?? null,
        cancelledAt: new Date(),
      })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, from)))
      .returning()
  },

  updatePaymentStatus(
    bookingId: string,
    status: 'pending' | 'paid' | 'failed' | 'refunded' | 'collected',
    paidAt?: Date | null
  ) {
    return db
      .update(payments)
      .set({
        status,
        ...(paidAt !== undefined ? { paidAt } : {}),
      })
      .where(eq(payments.bookingId, bookingId))
      .returning()
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

  findPublicVendorById(id: string) {
    return db.query.vendors.findFirst({
      where: and(
        eq(vendors.id, id),
        eq(vendors.status, 'active'),
        eq(vendors.isVerified, true)
      ),
    })
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
