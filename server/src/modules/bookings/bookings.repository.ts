import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  bookings,
  payments,
  services,
  userAddresses,
  userVehicles,
  vendors,
} from '../../db/schema.js'
import type { bookingStatusEnum, bookingTypeEnum } from '../../db/schema.js'

type BookingStatus = (typeof bookingStatusEnum.enumValues)[number]
type BookingType = (typeof bookingTypeEnum.enumValues)[number]

export type BookingRecord = typeof bookings.$inferSelect
export type PaymentRecord = typeof payments.$inferSelect

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
    status?: 'pending' | 'confirmed' | 'in_progress' | 'completed'
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
    lockDate: string
    serviceDurationMins: number
    amount: string
    paymentMethod: 'online' | 'cash'
    lat?: number | null
    lng?: number | null
    address?: string | null
  }) {
    return db.transaction(async (tx) => {
      const requestedEnd = new Date(
        data.scheduledAt.getTime() + data.serviceDurationMins * 60 * 1000
      )
      const lockKey = `booking:${data.vendorId}:${data.lockDate}`

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`
      )

      const conflictingBookings = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .where(
          and(
            eq(bookings.vendorId, data.vendorId),
            ne(bookings.status, 'cancelled'),
            sql`${bookings.scheduledAt} < ${requestedEnd}`,
            sql`${bookings.scheduledAt} + (${services.durationMins} * interval '1 minute') > ${data.scheduledAt}`
          )
        )
        .limit(1)

      if (conflictingBookings.length > 0) {
        return { booking: null, payment: null, conflict: true as const }
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
          amount: data.amount,
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

      return { booking, payment, conflict: false as const }
    })
  },

  updateBookingStatus(bookingId: string, status: BookingStatus) {
    return db
      .update(bookings)
      .set({ status })
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

  listBookingsForDate(vendorId: string, date: string) {
    const dayStart = new Date(`${date}T00:00:00.000Z`)
    const dayEnd = new Date(`${date}T23:59:59.999Z`)

    return db.query.bookings.findMany({
      where: and(
        eq(bookings.vendorId, vendorId),
        gte(bookings.scheduledAt, dayStart),
        lt(bookings.scheduledAt, dayEnd),
        ne(bookings.status, 'cancelled')
      ),
      with: {
        service: true,
      },
    })
  },
}
