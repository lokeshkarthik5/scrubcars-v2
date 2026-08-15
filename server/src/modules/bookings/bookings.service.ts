import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  computeAvailableSlots,
  getDateKeyFromScheduledAt,
  getDayOfWeekFromDate,
  isScheduledAtAvailable,
} from '../../lib/slots.js'
import { computeServiceAmount } from '../../lib/pricing.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { bookingsRepository } from './bookings.repository.js'

const log = logger.child({ module: 'bookings' })

// Customers must cancel or reschedule at least this far ahead of the time.
const CANCELLATION_CUTOFF_MS = 2 * 60 * 60 * 1000
// A booking may be rescheduled at most this many times across its chain.
const MAX_RESCHEDULES = 2
import type { PaymentRecord } from './bookings.repository.js'
import type {
  CreateBookingInput,
  ListMyBookingsQuery,
  ListVendorBookingsQuery,
} from './bookings.validation.js'

type BookingWithRelations = {
  id: string
  status: string
  bookingType: string
  scheduledAt: Date
  amount: string
  paymentMethod: string
  lat: number | null
  lng: number | null
  address: string | null
  cancelledBy?: string | null
  cancellationReason?: string | null
  cancelledAt?: Date | null
  originalBookingId?: string | null
  rescheduledFromId?: string | null
  rescheduleCount?: number | null
  createdAt: Date
  review?: {
    id: string
    rating: number
    comment: string | null
    createdAt: Date
  } | null
  user?: {
    id: string
    name: string
    phone: string
  } | null
  vendor?: {
    id: string
    businessName: string
    phone: string
    city: string
  } | null
  service?: {
    id: string
    name: string
    category: string
    pricingType: string
    durationMins: number
  } | null
  vehicle?: {
    id: string
    make: string
    model: string
    licensePlate: string | null
    vehicleType: string
  } | null
  payment?: PaymentRecord | null
}

function toPaymentResponse(payment: PaymentRecord | null | undefined) {
  if (!payment) {
    return null
  }

  return {
    id: payment.id,
    gateway: payment.gateway,
    gatewayTxnId: payment.gatewayTxnId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  }
}

function toBookingResponse(booking: BookingWithRelations) {
  return {
    id: booking.id,
    status: booking.status,
    bookingType: booking.bookingType,
    scheduledAt: booking.scheduledAt.toISOString(),
    amount: booking.amount,
    paymentMethod: booking.paymentMethod,
    lat: booking.lat,
    lng: booking.lng,
    address: booking.address,
    cancelledBy: booking.cancelledBy ?? null,
    cancellationReason: booking.cancellationReason ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    originalBookingId: booking.originalBookingId ?? null,
    rescheduledFromId: booking.rescheduledFromId ?? null,
    rescheduleCount: booking.rescheduleCount ?? 0,
    remainingReschedules: Math.max(0, MAX_RESCHEDULES - (booking.rescheduleCount ?? 0)),
    maxReschedules: MAX_RESCHEDULES,
    createdAt: booking.createdAt.toISOString(),
    review: booking.review
      ? {
          id: booking.review.id,
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt.toISOString(),
        }
      : null,
    user: booking.user
      ? {
          id: booking.user.id,
          name: booking.user.name,
          phone: booking.user.phone,
        }
      : null,
    vendor: booking.vendor
      ? {
          id: booking.vendor.id,
          businessName: booking.vendor.businessName,
          phone: booking.vendor.phone,
          city: booking.vendor.city,
        }
      : null,
    service: booking.service
      ? {
          id: booking.service.id,
          name: booking.service.name,
          category: booking.service.category,
          pricingType: booking.service.pricingType,
          durationMins: booking.service.durationMins,
        }
      : null,
    vehicle: booking.vehicle
      ? {
          id: booking.vehicle.id,
          make: booking.vehicle.make,
          model: booking.vehicle.model,
          licensePlate: booking.vehicle.licensePlate,
          vehicleType: booking.vehicle.vehicleType,
        }
      : null,
    payment: toPaymentResponse(booking.payment),
  }
}

async function getVendorForOwner(ownerId: string) {
  const vendor = await vendorsRepository.findVendorByOwnerId(ownerId)

  if (!vendor) {
    throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  }

  return vendor
}

async function validateSlotAvailability(
  vendorId: string,
  serviceId: string,
  scheduledAt: Date,
  serviceDurationMins: number
) {
  const date = getDateKeyFromScheduledAt(scheduledAt)
  const dayOfWeek = getDayOfWeekFromDate(date)
  log.info({ vendorId, serviceId, date, dayOfWeek, scheduledAt: scheduledAt.toISOString() }, 'booking:slot_check_start')

  const hours = await vendorsRepository.findWorkingHoursForDay(
    vendorId,
    dayOfWeek
  )

  log.info({ vendorId, date, dayOfWeek, hours: hours ? { openTime: hours.openTime, closeTime: hours.closeTime, isClosed: hours.isClosed } : null }, 'booking:working_hours_fetched')

  if (!hours || hours.isClosed) {
    log.warn({ vendorId, date, dayOfWeek, hoursFound: !!hours, isClosed: hours?.isClosed }, 'booking:slot_unavailable_closed')
    throw new AppError(
      400,
      'Selected slot is not available',
      'SLOT_UNAVAILABLE'
    )
  }

  // Capacity is unlimited, so existing bookings are irrelevant here: this only
  // checks that the requested time lands on a real slot within working hours.
  const vendor = await bookingsRepository.findVendorById(vendorId)

  if (!vendor) {
    log.error({ vendorId }, 'booking:vendor_missing_in_slot_check')
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }

  const availableSlots = computeAvailableSlots({
    date,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    intervalMins: vendor.slotIntervalMins,
    isClosed: hours.isClosed,
    serviceDurationMins,
  })

  log.info({ vendorId, date, availableSlotsCount: availableSlots.length, requestedSlot: scheduledAt.toISOString() }, 'booking:available_slots_computed')

  if (!isScheduledAtAvailable(scheduledAt, availableSlots)) {
    log.warn({ vendorId, date, scheduledAt: scheduledAt.toISOString(), availableSlotsCount: availableSlots.length }, 'booking:slot_unavailable_taken')
    throw new AppError(
      400,
      'Selected slot is not available',
      'SLOT_UNAVAILABLE'
    )
  }

  log.info({ vendorId, scheduledAt: scheduledAt.toISOString() }, 'booking:slot_available')
}

async function getBookingForCustomer(userId: string, bookingId: string) {
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking || booking.userId !== userId) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  return booking
}

async function getBookingForVendor(ownerId: string, bookingId: string) {
  const vendor = await getVendorForOwner(ownerId)
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking || booking.vendorId !== vendor.id) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  return { booking, vendor }
}

async function getBookingForViewer(
  userId: string,
  isVendorOwner: boolean,
  bookingId: string
) {
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  if (booking.userId === userId) {
    return booking
  }

  if (isVendorOwner) {
    const vendor = await vendorsRepository.findVendorByOwnerId(userId)
    if (vendor && booking.vendorId === vendor.id) {
      return booking
    }
  }

  throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

export const bookingsService = {
  async listMyBookings(userId: string, query: ListMyBookingsQuery) {
    const bookings = await bookingsRepository.listBookingsForUser(userId, {
      status: query.status,
      bookingType: query.booking_type,
    })

    return bookings.map(toBookingResponse)
  },

  async getBookingDetail(
    userId: string,
    isVendorOwner: boolean,
    bookingId: string
  ) {
    const booking = await getBookingForViewer(userId, isVendorOwner, bookingId)

    return toBookingResponse(booking)
  },

  async createBooking(userId: string, input: CreateBookingInput) {
    log.info({
      userId,
      vendorId: input.vendorId,
      serviceId: input.serviceId,
      vehicleId: input.vehicleId,
      scheduledAt: input.scheduledAt,
      bookingType: input.bookingType,
      paymentMethod: input.paymentMethod,
    }, 'booking:create_start')

    try {
      const scheduledAt = new Date(input.scheduledAt)

      if (Number.isNaN(scheduledAt.getTime())) {
        log.warn({ userId, scheduledAt: input.scheduledAt }, 'booking:invalid_scheduled_at')
        throw new AppError(400, 'Invalid scheduledAt', 'INVALID_SCHEDULED_AT')
      }

      if (scheduledAt.getTime() <= Date.now()) {
        log.warn({ userId, scheduledAt: scheduledAt.toISOString() }, 'booking:scheduled_at_in_past')
        throw new AppError(
          400,
          'Cannot book a slot in the past',
          'INVALID_SCHEDULED_AT'
        )
      }

      const vendor = await bookingsRepository.findPublicVendorById(input.vendorId)
      log.info({ vendorId: input.vendorId, found: !!vendor, isVerified: vendor?.isVerified, status: vendor?.status }, 'booking:vendor_lookup')

      if (!vendor) {
        log.warn({ userId, vendorId: input.vendorId }, 'booking:vendor_not_found')
        throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      }

      if (input.bookingType === 'dropin' && !vendor.dropinEnabled) {
        log.warn({ userId, vendorId: vendor.id, bookingType: input.bookingType }, 'booking:dropin_not_enabled')
        throw new AppError(
          400,
          'Vendor does not accept drop-in bookings',
          'DROPIN_NOT_ENABLED'
        )
      }

      const service = await bookingsRepository.findServiceForVendor(
        vendor.id,
        input.serviceId
      )
      log.info({ vendorId: vendor.id, serviceId: input.serviceId, found: !!service, isActive: service?.isActive }, 'booking:service_lookup')

      if (!service || !service.isActive) {
        log.warn({ userId, vendorId: vendor.id, serviceId: input.serviceId, found: !!service, isActive: service?.isActive }, 'booking:service_not_found')
        throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
      }

      const vehicle = await bookingsRepository.findVehicleForUser(
        userId,
        input.vehicleId
      )
      log.info({ userId, vehicleId: input.vehicleId, found: !!vehicle }, 'booking:vehicle_lookup')

      if (!vehicle) {
        log.warn({ userId, vehicleId: input.vehicleId }, 'booking:vehicle_not_found')
        throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
      }

      // Resolve the charge from the pricing type and the customer's vehicle.
      const amount = computeServiceAmount(service, vehicle.vehicleType)

      let lat: number | null = null
      let lng: number | null = null
      let address: string | null = null

      log.info({ userId, vendorId: vendor.id, serviceId: service.id, scheduledAt: scheduledAt.toISOString(), durationMins: service.durationMins }, 'booking:slot_validation_start')

      await validateSlotAvailability(
        vendor.id,
        service.id,
        scheduledAt,
        service.durationMins
      )

      const bookingDate = getDateKeyFromScheduledAt(scheduledAt)
      log.info({ userId, vendorId: vendor.id, bookingDate, scheduledAt: scheduledAt.toISOString() }, 'booking:db_insert_start')

      const result =
        await bookingsRepository.createBookingWithPayment({
          userId,
          vendorId: vendor.id,
          serviceId: service.id,
          vehicleId: vehicle.id,
          bookingType: input.bookingType,
          scheduledAt,
          serviceDurationMins: service.durationMins,
          amount,
          paymentMethod: input.paymentMethod,
          lat,
          lng,
          address,
        })

      if (result.vehicleClash) {
        log.warn(
          {
            userId,
            vehicleId: vehicle.id,
            scheduledAt: scheduledAt.toISOString(),
            clashingBookingId: result.vehicleClash.id,
          },
          'booking:vehicle_double_booked'
        )
        throw new AppError(
          409,
          'This vehicle already has a booking that overlaps this time',
          'VEHICLE_DOUBLE_BOOKED'
        )
      }

      const { booking, payment } = result
      log.info({ bookingId: booking.id, paymentId: payment.id }, 'booking:db_insert_done')

      const fullBooking = await bookingsRepository.findBookingById(booking.id)

      if (!fullBooking) {
        log.error({ bookingId: booking.id, userId, vendorId: vendor.id }, 'booking:full_fetch_failed')
        throw new AppError(
          500,
          'Failed to load created booking',
          'BOOKING_CREATE_FAILED'
        )
      }

      log.info({
        bookingId: booking.id,
        userId,
        vendorId: vendor.id,
        serviceId: service.id,
        vehicleId: vehicle.id,
        scheduledAt: scheduledAt.toISOString(),
        bookingType: input.bookingType,
        paymentMethod: input.paymentMethod,
        amount,
      }, 'booking:created')

      return toBookingResponse({ ...fullBooking, payment })
    } catch (err) {
      if (err instanceof AppError) throw err
      log.error({
        err,
        userId,
        vendorId: input.vendorId,
        serviceId: input.serviceId,
        vehicleId: input.vehicleId,
        scheduledAt: input.scheduledAt,
      }, 'booking:create_failed')
      throw err
    }
  },

  async cancelBooking(userId: string, bookingId: string, reason?: string) {
    const booking = await getBookingForCustomer(userId, bookingId)

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new AppError(
        400,
        'Only pending or confirmed bookings can be cancelled',
        'INVALID_BOOKING_STATUS'
      )
    }

    const msUntilBooking = booking.scheduledAt.getTime() - Date.now()
    if (msUntilBooking < CANCELLATION_CUTOFF_MS) {
      throw new AppError(
        400,
        'Bookings can only be cancelled at least 2 hours before the scheduled time',
        'CANCELLATION_WINDOW_PASSED'
      )
    }

    await bookingsRepository.cancelBooking(bookingId, 'user', reason)
    log.info({ bookingId, userId, status: 'cancelled', cancelledBy: 'user' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },

  async rescheduleBooking(
    userId: string,
    bookingId: string,
    newScheduledAtInput: string,
    reason?: string
  ) {
    const booking = await getBookingForCustomer(userId, bookingId)

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new AppError(
        400,
        'Only pending or confirmed bookings can be rescheduled',
        'INVALID_BOOKING_STATUS'
      )
    }

    if ((booking.rescheduleCount ?? 0) >= MAX_RESCHEDULES) {
      throw new AppError(
        400,
        `A booking can be rescheduled at most ${MAX_RESCHEDULES} times`,
        'RESCHEDULE_LIMIT_REACHED'
      )
    }

    const msUntilBooking = booking.scheduledAt.getTime() - Date.now()
    if (msUntilBooking < CANCELLATION_CUTOFF_MS) {
      throw new AppError(
        400,
        'Bookings can only be rescheduled at least 2 hours before the scheduled time',
        'RESCHEDULE_WINDOW_PASSED'
      )
    }

    const newScheduledAt = new Date(newScheduledAtInput)
    if (Number.isNaN(newScheduledAt.getTime())) {
      throw new AppError(400, 'Invalid scheduledAt', 'INVALID_SCHEDULED_AT')
    }
    if (newScheduledAt.getTime() <= Date.now()) {
      throw new AppError(
        400,
        'Cannot reschedule to a slot in the past',
        'INVALID_SCHEDULED_AT'
      )
    }

    const service = booking.service
    if (!service) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    await validateSlotAvailability(
      booking.vendorId,
      service.id,
      newScheduledAt,
      service.durationMins
    )

    const rootBookingId = booking.originalBookingId ?? booking.id

    const result = await bookingsRepository.rescheduleBookingWithPayment({
      sourceBookingId: booking.id,
      rootBookingId,
      userId,
      vendorId: booking.vendorId,
      serviceId: service.id,
      vehicleId: booking.vehicleId,
      bookingType: booking.bookingType,
      newScheduledAt,
      serviceDurationMins: service.durationMins,
      status: booking.status,
      amount: booking.amount,
      paymentMethod: booking.paymentMethod,
      lat: booking.lat,
      lng: booking.lng,
      address: booking.address,
      sourcePayment: booking.payment
        ? {
            gateway: booking.payment.gateway,
            gatewayTxnId: booking.payment.gatewayTxnId,
            amount: booking.payment.amount,
            currency: booking.payment.currency,
            status: booking.payment.status,
            paidAt: booking.payment.paidAt,
          }
        : null,
      reason: reason ?? null,
      maxReschedules: MAX_RESCHEDULES,
    })

    if (result.capReached) {
      throw new AppError(
        400,
        `A booking can be rescheduled at most ${MAX_RESCHEDULES} times`,
        'RESCHEDULE_LIMIT_REACHED'
      )
    }

    if (result.vehicleClash) {
      log.warn(
        {
          userId,
          vehicleId: booking.vehicleId,
          newScheduledAt: newScheduledAt.toISOString(),
          clashingBookingId: result.vehicleClash.id,
        },
        'booking:vehicle_double_booked'
      )
      throw new AppError(
        409,
        'This vehicle already has another booking that overlaps this time',
        'VEHICLE_DOUBLE_BOOKED'
      )
    }

    log.info(
      {
        userId,
        fromBookingId: booking.id,
        toBookingId: result.booking.id,
        rootBookingId,
        newScheduledAt: newScheduledAt.toISOString(),
      },
      'booking:rescheduled'
    )

    const fullBooking = await bookingsRepository.findBookingById(
      result.booking.id
    )
    return toBookingResponse(fullBooking!)
  },

  async listVendorBookings(ownerId: string, query: ListVendorBookingsQuery) {
    const vendor = await getVendorForOwner(ownerId)
    const bookings = await bookingsRepository.listBookingsForVendor(
      vendor.id,
      query.status
    )

    return bookings.map(toBookingResponse)
  },

  async acceptBooking(ownerId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(ownerId, bookingId)

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be accepted',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'confirmed')
    log.info({ bookingId, ownerId, status: 'confirmed' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },

  async rejectBooking(ownerId: string, bookingId: string, reason?: string) {
    const { booking } = await getBookingForVendor(ownerId, bookingId)

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be rejected',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.cancelBooking(bookingId, 'vendor', reason)
    log.info({ bookingId, ownerId, status: 'cancelled', cancelledBy: 'vendor' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },

  async markInProgress(ownerId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(ownerId, bookingId)

    if (booking.status !== 'confirmed') {
      throw new AppError(
        400,
        'Only confirmed bookings can be marked in progress',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'in_progress')
    log.info({ bookingId, ownerId, status: 'in_progress' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },

  async markCompleted(ownerId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(ownerId, bookingId)

    if (booking.status !== 'in_progress') {
      throw new AppError(
        400,
        'Only in-progress bookings can be completed',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'completed')

    if (booking.paymentMethod === 'cash') {
      await bookingsRepository.updatePaymentStatus(bookingId, 'collected', new Date())
    }

    log.info({ bookingId, ownerId, status: 'completed', paymentMethod: booking.paymentMethod }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },
}
