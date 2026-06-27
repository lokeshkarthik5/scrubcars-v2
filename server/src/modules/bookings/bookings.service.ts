import { AppError } from '../../lib/errors.js'
import {
  computeAvailableSlots,
  getDateKeyFromScheduledAt,
  getDayOfWeekFromDate,
  isScheduledAtAvailable,
  type BookedRange,
} from '../../lib/slots.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import { bookingsRepository } from './bookings.repository.js'
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
  createdAt: Date
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
    createdAt: booking.createdAt.toISOString(),
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
  const hours = await vendorsRepository.findWorkingHoursForDay(
    vendorId,
    dayOfWeek
  )

  if (!hours || hours.isClosed) {
    throw new AppError(
      400,
      'Selected slot is not available',
      'SLOT_UNAVAILABLE'
    )
  }

  const dayBookings = await bookingsRepository.listBookingsForDate(
    vendorId,
    date
  )

  const bookedRanges: BookedRange[] = dayBookings.map((booking) => {
    const durationMins = booking.service?.durationMins ?? serviceDurationMins
    const start = booking.scheduledAt
    const end = new Date(start.getTime() + durationMins * 60 * 1000)
    return { start, end }
  })

  const vendor = await bookingsRepository.findVendorById(vendorId)

  if (!vendor) {
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }

  const availableSlots = computeAvailableSlots({
    date,
    openTime: hours.openTime,
    closeTime: hours.closeTime,
    intervalMins: vendor.slotIntervalMins,
    isClosed: hours.isClosed,
    serviceDurationMins,
    bookedRanges,
  })

  if (!isScheduledAtAvailable(scheduledAt, availableSlots)) {
    throw new AppError(
      400,
      'Selected slot is not available',
      'SLOT_UNAVAILABLE'
    )
  }
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
    const scheduledAt = new Date(input.scheduledAt)

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new AppError(400, 'Invalid scheduledAt', 'INVALID_SCHEDULED_AT')
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError(
        400,
        'Cannot book a slot in the past',
        'INVALID_SCHEDULED_AT'
      )
    }

    const vendor = await bookingsRepository.findPublicVendorById(input.vendorId)

    if (!vendor) {
      throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
    }

    if (input.bookingType === 'doorstep' && !vendor.doorstepEnabled) {
      throw new AppError(
        400,
        'Vendor does not accept doorstep bookings',
        'DOORSTEP_NOT_ENABLED'
      )
    }

    if (input.bookingType === 'dropin' && !vendor.dropinEnabled) {
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

    if (!service || !service.isActive) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const vehicle = await bookingsRepository.findVehicleForUser(
      userId,
      input.vehicleId
    )

    if (!vehicle) {
      throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
    }

    let lat: number | null = null
    let lng: number | null = null
    let address: string | null = null

    if (input.bookingType === 'doorstep') {
      const savedAddress = await bookingsRepository.findAddressForUser(
        userId,
        input.addressId!
      )

      if (!savedAddress) {
        throw new AppError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
      }

      lat = savedAddress.lat
      lng = savedAddress.lng
      address = `${savedAddress.address}, ${savedAddress.city}`
    }

    await validateSlotAvailability(
      vendor.id,
      service.id,
      scheduledAt,
      service.durationMins
    )

    const { booking, payment } =
      await bookingsRepository.createBookingWithPayment({
        userId,
        vendorId: vendor.id,
        serviceId: service.id,
        vehicleId: vehicle.id,
        bookingType: input.bookingType,
        scheduledAt,
        amount: service.price,
        paymentMethod: input.paymentMethod,
        lat,
        lng,
        address,
      })

    const fullBooking = await bookingsRepository.findBookingById(booking.id)

    if (!fullBooking) {
      throw new AppError(
        500,
        'Failed to load created booking',
        'BOOKING_CREATE_FAILED'
      )
    }

    return toBookingResponse({ ...fullBooking, payment })
  },

  async cancelBooking(userId: string, bookingId: string) {
    const booking = await getBookingForCustomer(userId, bookingId)

    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new AppError(
        400,
        'Only pending or confirmed bookings can be cancelled',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'cancelled')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
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

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },

  async rejectBooking(ownerId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(ownerId, bookingId)

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be rejected',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'cancelled')

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
      await bookingsRepository.updatePaymentStatus(
        bookingId,
        'collected',
        new Date()
      )
    }

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toBookingResponse(updated!)
  },
}
