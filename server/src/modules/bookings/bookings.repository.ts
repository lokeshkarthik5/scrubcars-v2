import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '../../db/index.js'
import {
  bookingReschedules,
  bookings,
  discountRedemptions,
  payments,
  services,
  userAddresses,
  userVehicles,
  vendors,
} from '../../db/schema.js'
import type { bookingStatusEnum, bookingTypeEnum } from '../../db/schema.js'
import { DISCOUNT_HELD } from '../discounts/discounts.predicates.js'

type BookingStatus = (typeof bookingStatusEnum.enumValues)[number]
type BookingType = (typeof bookingTypeEnum.enumValues)[number]

export type BookingRecord = typeof bookings.$inferSelect
export type PaymentRecord = typeof payments.$inferSelect

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

// Vendor capacity is unlimited, so nothing stops two customers — or the same
// customer with two different cars — from taking the same time. What is still
// impossible is one car being serviced in two places at once, so a vehicle may
// not hold overlapping active bookings. This is the guard that replaces the old
// vendor-wide slot conflict check, scoped to the vehicle rather than the slot.
//
// Runs inside the caller's transaction, after a lock on the vehicle, so two
// concurrent requests can't both read "no overlap" and both insert.
async function findOverlappingVehicleBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  params: {
    vehicleId: string
    scheduledAt: Date
    serviceDurationMins: number
    excludeBookingId?: string
  }
) {
  const requestedEnd = new Date(
    params.scheduledAt.getTime() + params.serviceDurationMins * 60 * 1000
  )

  const [existing] = await tx
    .select({ id: bookings.id, scheduledAt: bookings.scheduledAt })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        eq(bookings.vehicleId, params.vehicleId),
        inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
        params.excludeBookingId
          ? ne(bookings.id, params.excludeBookingId)
          : undefined,
        // Half-open overlap: existing starts before this one ends, and ends
        // after this one starts. Back-to-back bookings don't collide.
        sql`${bookings.scheduledAt} < ${requestedEnd.toISOString()}::timestamptz`,
        sql`${bookings.scheduledAt} + (${services.durationMins} * interval '1 minute') > ${params.scheduledAt.toISOString()}::timestamptz`
      )
    )
    .limit(1)

  return existing ?? null
}

// Serialises concurrent bookings for one vehicle. Taken before the overlap
// check in every path that creates a booking, and always acquired first so the
// lock ordering is consistent and can't deadlock against the reschedule lock.
// Shares DISCOUNT_HELD with discounts.repository.ts rather than restating it:
// the pre-check and this in-transaction re-check must apply the same rule, and
// two hand-copied predicates were one edit away from disagreeing.
async function countHeldRedemptions(
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
async function lockDiscount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  discountId: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`discount:${discountId}`})::bigint)`
  )
}

async function lockVehicle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, any>,
  vehicleId: string
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`vehicle:${vehicleId}`})::bigint)`
  )
}

export const bookingsRepository = {
  findBookingById(id: string) {
    return db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: {
        user: true,
        vendor: true,
        service: true,
        vehicle: true,
        payment: true,
        review: true,
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
        vehicle: true,
        payment: true,
      },
      orderBy: [desc(bookings.scheduledAt)],
    })
  },

  listBookingsForVendor(
    vendorId: string,
    status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  ) {
    const conditions = [eq(bookings.vendorId, vendorId)]

    if (status) {
      conditions.push(eq(bookings.status, status))
    }

    return db.query.bookings.findMany({
      where: and(...conditions),
      with: {
        user: true,
        service: true,
        vehicle: true,
        payment: true,
        review: true,
      },
      orderBy: [desc(bookings.scheduledAt)],
    })
  },

  createBookingWithPayment(data: {
    userId: string
    vendorId: string
    serviceId: string
    vehicleId: string
    bookingType: BookingType
    scheduledAt: Date
    serviceDurationMins: number
    // Pre-discount service price.
    subtotalAmount: string
    // What is actually charged: subtotalAmount - discount.discountAmount.
    amount: string
    paymentMethod: 'online' | 'cash'
    lat?: number | null
    lng?: number | null
    address?: string | null
    discount?: BookingDiscount | null
  }) {
    // Capacity is unlimited, so there is no vendor-side slot contention to
    // guard against — only the one-car-in-one-place rule below.
    return db.transaction(async (tx) => {
      await lockVehicle(tx, data.vehicleId)

      const clash = await findOverlappingVehicleBooking(tx, {
        vehicleId: data.vehicleId,
        scheduledAt: data.scheduledAt,
        serviceDurationMins: data.serviceDurationMins,
      })

      if (clash) {
        return {
          booking: null,
          payment: null,
          vehicleClash: clash,
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
          serviceId: data.serviceId,
          vehicleId: data.vehicleId,
          bookingType: data.bookingType,
          scheduledAt: data.scheduledAt,
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
        discountUnavailable: false as const,
      }
    })
  },

  rescheduleBookingWithPayment(data: {
    sourceBookingId: string
    rootBookingId: string
    userId: string
    vendorId: string
    serviceId: string
    vehicleId: string
    bookingType: BookingType
    newScheduledAt: Date
    serviceDurationMins: number
    status: BookingStatus
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
        }
      }

      // The booking being moved is still active at this point (it is cancelled
      // further down), so it must be excluded or it would clash with itself
      // whenever the new time overlaps the old one.
      const clash = await findOverlappingVehicleBooking(tx, {
        vehicleId: data.vehicleId,
        scheduledAt: data.newScheduledAt,
        serviceDurationMins: data.serviceDurationMins,
        excludeBookingId: data.sourceBookingId,
      })

      if (clash) {
        return {
          booking: null,
          payment: null,
          capReached: false as const,
          vehicleClash: clash,
        }
      }

      const [booking] = await tx
        .insert(bookings)
        .values({
          userId: data.userId,
          vendorId: data.vendorId,
          serviceId: data.serviceId,
          vehicleId: data.vehicleId,
          bookingType: data.bookingType,
          scheduledAt: data.newScheduledAt,
          status: data.status,
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
      }
    })
  },

  updateBookingStatus(bookingId: string, status: BookingStatus) {
    return db
      .update(bookings)
      .set({ status })
      .where(eq(bookings.id, bookingId))
      .returning()
  },

  cancelBooking(
    bookingId: string,
    cancelledBy: 'user' | 'vendor',
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
      .where(eq(bookings.id, bookingId))
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

  findVehicleForUser(userId: string, vehicleId: string) {
    return db.query.userVehicles.findFirst({
      where: and(
        eq(userVehicles.id, vehicleId),
        eq(userVehicles.userId, userId)
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

  findServiceForVendor(vendorId: string, serviceId: string) {
    return db.query.services.findFirst({
      where: and(eq(services.id, serviceId), eq(services.vendorId, vendorId)),
    })
  },
}
