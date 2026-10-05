import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import {
  computeAvailableSlots,
  getDateKeyFromScheduledAt,
  getDayOfWeekFromDate,
  isScheduledAtAvailable,
} from '../../lib/slots.js'
import { computeServiceAmount, sumAmounts } from '../../lib/pricing.js'
import { computeVendorPayout } from '../../lib/discounts.js'
import { discountsService } from '../discounts/discounts.service.js'
import { membersRepository } from '../members/members.repository.js'
import { vendorsRepository } from '../vendors/vendors.repository.js'
import type { BookingDiscount } from './bookings.repository.js'
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
  durationMins?: number | null
  amount: string
  subtotalAmount?: string | null
  discountAmount?: string | null
  discountCode?: string | null
  discountFundedBy?: 'platform' | 'vendor' | null
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
    address: string
    lat: number | null
    lng: number | null
    whatsapp: string | null
  } | null
  service?: {
    id: string
    name: string
    category: string
    pricingType: string
    durationMins: number
  } | null
  items?: Array<{
    id: string
    serviceId: string
    name: string
    amount: string
    durationMins: number
    sortOrder: number
  }> | null
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
    // Pre-discount price, what came off, and who paid for it. `amount` stays
    // the figure actually charged, so every existing consumer is unaffected.
    subtotalAmount: booking.subtotalAmount ?? booking.amount,
    discountAmount: booking.discountAmount ?? '0.00',
    discountCode: booking.discountCode ?? null,
    discountFundedBy: booking.discountFundedBy ?? null,
    // What the garage is owed — the full price when Detlio funded the
    // discount, the discounted price when the garage did. Computed here so the
    // web Earnings screen never has to know the rule.
    vendorPayoutAmount: computeVendorPayout({
      amount: booking.amount,
      subtotalAmount: booking.subtotalAmount ?? booking.amount,
      discountFundedBy: booking.discountFundedBy ?? null,
    }),
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
    // Where the garage is and how to reach it: the customer's booking page
    // gives directions and a call/WhatsApp button from these. All of it is
    // already public on the garage page.
    vendor: booking.vendor
      ? {
          id: booking.vendor.id,
          businessName: booking.vendor.businessName,
          phone: booking.vendor.phone,
          city: booking.vendor.city,
          address: booking.vendor.address,
          lat: booking.vendor.lat,
          lng: booking.vendor.lng,
          whatsapp: booking.vendor.whatsapp,
        }
      : null,
    // The services this booking is for, in the order they were picked, with
    // the name and price as sold. Every consumer that shows more than one
    // service reads this.
    items: (booking.items ?? []).map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      name: item.name,
      amount: item.amount,
      durationMins: item.durationMins,
    })),
    durationMins:
      booking.durationMins ??
      (booking.items ?? []).reduce((total, item) => total + item.durationMins, 0),
    // Deprecated: the first item, kept so clients that predate `items` keep
    // rendering something correct for a single-service booking. Remove once
    // they have all moved over.
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

/**
 * The vendor-facing shape of a booking. Two mappers for two audiences, not one
 * mapper with a role flag: the vendor payload has a single fixed shape whatever
 * the caller's role, which is easier to type on the client and impossible to get
 * wrong per request.
 *
 * What is missing is the whole point. `vendorPayoutAmount`, `subtotalAmount`,
 * `discountAmount` and `discountFundedBy` had no vendor-side consumer left once
 * the earnings computation moved server-side, so they are simply absent — and a
 * field that is never serialized cannot be forgotten about on a new endpoint.
 *
 * `amount` and `paymentMethod` stay: a cash booking goes pending → collected at
 * completion, so whoever finishes the job has to know what to collect.
 */
function toVendorBookingResponse(booking: BookingWithRelations) {
  const {
    vendorPayoutAmount: _payout,
    subtotalAmount: _subtotal,
    discountAmount: _discountAmount,
    discountFundedBy: _fundedBy,
    ...vendorView
  } = toBookingResponse(booking)

  return vendorView
}

/**
 * The vendorId always comes from `resolveTenant`, which has already checked the
 * caller has an active seat in it. This re-reads the row; it does not
 * re-authorize.
 */
async function getTenantVendor(vendorId: string) {
  const vendor = await vendorsRepository.findVendorById(vendorId)

  if (!vendor) {
    throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  }

  return vendor
}

async function validateSlotAvailability(
  vendorId: string,
  serviceIds: string[],
  scheduledAt: Date,
  // The total across every service in the booking. A five-service cart needs a
  // block long enough for all of it, and may not fit the day at all.
  durationMins: number
) {
  const date = getDateKeyFromScheduledAt(scheduledAt)
  const dayOfWeek = getDayOfWeekFromDate(date)
  log.info({ vendorId, serviceIds, date, dayOfWeek, durationMins, scheduledAt: scheduledAt.toISOString() }, 'booking:slot_check_start')

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
    serviceDurationMins: durationMins,
  })

  log.info({ vendorId, date, availableSlotsCount: availableSlots.length, requestedSlot: scheduledAt.toISOString() }, 'booking:available_slots_computed')

  if (!isScheduledAtAvailable(scheduledAt, availableSlots)) {
    log.warn({ vendorId, date, scheduledAt: scheduledAt.toISOString(), durationMins, availableSlotsCount: availableSlots.length }, 'booking:slot_unavailable_taken')

    // A long enough list of services fits nowhere in the day, and "that slot
    // has gone" would be a lie — the customer can retry all afternoon and
    // never succeed. Say which it is.
    if (availableSlots.length === 0) {
      throw new AppError(
        400,
        'These services need more time than this garage has left in the day. Remove one, or pick another day.',
        'DURATION_EXCEEDS_WORKING_DAY'
      )
    }

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

async function getBookingForVendor(vendorId: string, bookingId: string) {
  const vendor = await getTenantVendor(vendorId)
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking || booking.vendorId !== vendor.id) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  return { booking, vendor }
}

/**
 * Read authorization for `GET /bookings/:id`, which serves customers *and*
 * vendors, and is the only place the old 1:1 was assumed inline. The vendor
 * branch is a mapping lookup now: "does this person hold an active seat in the
 * company that owns this booking?" — which is true for every member of that
 * company and for nobody else.
 *
 * Returns how the viewer resolved, because the vendor payload omits the money
 * breakdown the customer receipt needs (see toVendorBookingResponse).
 */
async function getBookingForViewer(userId: string, bookingId: string) {
  const booking = await bookingsRepository.findBookingById(bookingId)

  if (!booking) {
    throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
  }

  if (booking.userId === userId) {
    return { booking, viewer: 'customer' as const }
  }

  const seat = await membersRepository.findActiveVendorSeat(
    booking.vendorId,
    userId
  )

  if (seat) {
    return { booking, viewer: 'vendor' as const }
  }

  // A platform grant reads every company, same as it resolves every tenant.
  const platformRow = await membersRepository.findActivePlatformRow(userId)

  if (platformRow?.role === 'super_admin') {
    // Logged here rather than in middleware, which is the exception and worth
    // being explicit about: this route serves customers too, so it never runs
    // `resolveTenant` — and `resolveTenant` is where every other support-access
    // row is written. Without this, staff could read any booking's customer
    // name, phone and doorstep address on any garage with no trace, which is
    // exactly the access the audit log exists to record.
    await membersRepository.logInternalAccess({
      userId,
      vendorId: booking.vendorId,
      method: 'GET',
      endpoint: `/bookings/${bookingId}`,
    })

    return { booking, viewer: 'vendor' as const }
  }

  throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND')
}

/**
 * Validate and price a booking request, without writing anything.
 *
 * This is everything that has to be true before money can be taken: the slot is
 * real, the vendor takes this booking type, the service is priced for this
 * customer's vehicle, and the promo code applies. It is deliberately separate
 * from the write so the payment flow can price a booking that does not exist
 * yet — see booking-intents — while `createBooking` keeps using the exact same
 * rules. Two copies of this would be one edit away from a checkout that charges
 * a different figure than the booking it creates.
 */
export async function resolveBookingDraft(
  userId: string,
  input: CreateBookingInput
) {
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

  // Every requested service must belong to this vendor and be active. Fetched
  // in one query and then re-ordered to the customer's order, so the summary,
  // the receipt and the deprecated `bookings.service_id` all agree on which
  // service came first.
  const found = await bookingsRepository.findServicesForVendor(
    vendor.id,
    input.serviceIds
  )
  const byId = new Map(found.map((row) => [row.id, row]))
  const services = input.serviceIds.map((id) => byId.get(id))

  log.info({ vendorId: vendor.id, serviceIds: input.serviceIds, foundCount: found.length }, 'booking:service_lookup')

  const missing = input.serviceIds.filter((id) => {
    const row = byId.get(id)
    return !row || !row.isActive
  })

  if (missing.length > 0) {
    log.warn({ userId, vendorId: vendor.id, serviceIds: input.serviceIds, missing }, 'booking:service_not_found')
    throw new AppError(
      404,
      missing.length === input.serviceIds.length
        ? 'Service not found'
        : 'One of the services you picked is no longer available',
      'SERVICE_NOT_FOUND'
    )
  }

  const resolvedServices = services as NonNullable<(typeof services)[number]>[]
  // The first service, for the columns that still hold one. Not a fallback:
  // `serviceIds` is non-empty by schema, so this always exists.
  const service = resolvedServices[0]

  const vehicle = await bookingsRepository.findVehicleForUser(
    userId,
    input.vehicleId
  )
  log.info({ userId, vehicleId: input.vehicleId, found: !!vehicle }, 'booking:vehicle_lookup')

  if (!vehicle) {
    log.warn({ userId, vehicleId: input.vehicleId }, 'booking:vehicle_not_found')
    throw new AppError(404, 'Vehicle not found', 'VEHICLE_NOT_FOUND')
  }

  // Price each line from its pricing type and the customer's vehicle.
  // A per-vehicle service with no price for this tier has no defensible
  // amount — `price` is the cheapest tier, so charging it would bill an SUV
  // at the hatchback rate. Refuse instead of guessing, and name the service:
  // with several in the cart, "this service isn't priced" does not tell the
  // customer which one to remove.
  const items = resolvedServices.map((row) => {
    const lineAmount = computeServiceAmount(row, vehicle.vehicleType)

    if (lineAmount === null) {
      log.warn(
        {
          userId,
          serviceId: row.id,
          vehicleType: vehicle.vehicleType,
        },
        'booking:service_not_priced_for_vehicle'
      )
      throw new AppError(
        400,
        `${row.name} is not priced for your vehicle type yet. Remove it, or contact the garage.`,
        'SERVICE_NOT_PRICED_FOR_VEHICLE'
      )
    }

    return {
      serviceId: row.id,
      name: row.name,
      amount: lineAmount,
      durationMins: row.durationMins,
    }
  })

  // Sum the lines, then discount — never discount per line — or the invariant
  // `amount = subtotalAmount - discountAmount` drifts by a paisa. Summed in
  // paise so the arithmetic never runs through a float.
  const amount = sumAmounts(items.map((item) => item.amount))
  const durationMins = items.reduce((total, item) => total + item.durationMins, 0)

  // Resolve the promo code against the *server-computed* subtotal. A
  // failure here (expired, limit reached, wrong garage) surfaces as the
  // engine's own AppError, so the customer sees why.
  let discount: BookingDiscount | null = null
  let chargeAmount = amount

  if (input.discountCode) {
    const resolved = await discountsService.resolveDiscount({
      code: input.discountCode,
      userId,
      vendorId: vendor.id,
      subtotal: amount,
    })

    discount = {
      discountId: resolved.discountId,
      code: resolved.code,
      discountAmount: resolved.discountAmount,
      fundedBy: resolved.fundedBy,
      perUserLimit: resolved.perUserLimit,
      totalUsageLimit: resolved.totalUsageLimit,
    }
    chargeAmount = resolved.finalAmount

    log.info(
      {
        userId,
        code: resolved.code,
        subtotal: amount,
        discountAmount: resolved.discountAmount,
        chargeAmount,
      },
      'booking:discount_resolved'
    )
  }

  // Doorstep snapshots the customer's location onto the booking, so a later
  // edit to the saved address cannot change where the garage was told to go.
  //
  // Drop-in leaves all three null: the customer comes to the garage, so there
  // is no address to record.
  let lat: number | null = null
  let lng: number | null = null
  let address: string | null = null

  const bookingType = input.bookingType

  if (bookingType === 'doorstep') {
    if (!vendor.doorstepEnabled) {
      log.warn(
        { userId, vendorId: vendor.id },
        'booking:doorstep_not_enabled'
      )
      throw new AppError(
        400,
        'Vendor does not accept doorstep bookings',
        'DOORSTEP_NOT_ENABLED'
      )
    }

    if (!input.addressId) {
      throw new AppError(
        400,
        'Choose the address we should come to',
        'ADDRESS_REQUIRED'
      )
    }

    const savedAddress = await bookingsRepository.findAddressForUser(
      userId,
      input.addressId
    )

    if (!savedAddress) {
      throw new AppError(404, 'Address not found', 'ADDRESS_NOT_FOUND')
    }

    // An address saved without a pin is fine for drop-in and normal to have —
    // this is the one moment its coordinates actually matter, which is why the
    // customer is prompted here rather than nagged in their profile.
    if (savedAddress.lat === null || savedAddress.lng === null) {
      throw new AppError(
        422,
        'Confirm exactly where we should come on the map',
        'ADDRESS_LOCATION_REQUIRED'
      )
    }

    const covered = await bookingsRepository.isWithinDoorstepRadius(
      vendor.id,
      savedAddress.lat,
      savedAddress.lng
    )

    if (!covered) {
      log.warn(
        { userId, vendorId: vendor.id, addressId: input.addressId },
        'booking:outside_doorstep_radius'
      )
      throw new AppError(
        400,
        'This garage does not travel to that address',
        'OUTSIDE_DOORSTEP_RADIUS'
      )
    }

    lat = savedAddress.lat
    lng = savedAddress.lng
    address = savedAddress.address
  }

  log.info({ userId, vendorId: vendor.id, serviceIds: input.serviceIds, scheduledAt: scheduledAt.toISOString(), durationMins }, 'booking:slot_validation_start')

  await validateSlotAvailability(
    vendor.id,
    input.serviceIds,
    scheduledAt,
    durationMins
  )
  return {
    vendor,
    // The lines as they will be written, and the first service for the columns
    // that still carry one.
    items,
    service,
    durationMins,
    vehicle,
    scheduledAt,
    // Pre-discount total, and what is actually charged. Equal when no code.
    amount,
    chargeAmount,
    discount,
    lat,
    lng,
    address,
  }
}

export const bookingsService = {
  async listMyBookings(userId: string, query: ListMyBookingsQuery) {
    const bookings = await bookingsRepository.listBookingsForUser(userId, {
      status: query.status,
      bookingType: query.booking_type,
    })

    return bookings.map(toBookingResponse)
  },

  async getBookingDetail(userId: string, bookingId: string) {
    const { booking, viewer } = await getBookingForViewer(userId, bookingId)

    // The same booking, two shapes. The customer who owns it still gets the
    // discount breakdown their receipt needs; a vendor member does not.
    return viewer === 'vendor'
      ? toVendorBookingResponse(booking)
      : toBookingResponse(booking)
  },

  async createBooking(userId: string, input: CreateBookingInput) {
    log.info({
      userId,
      vendorId: input.vendorId,
      serviceIds: input.serviceIds,
      vehicleId: input.vehicleId,
      scheduledAt: input.scheduledAt,
      bookingType: input.bookingType,
      paymentMethod: input.paymentMethod,
    }, 'booking:create_start')

    try {
      const {
        vendor,
        items,
        durationMins,
        vehicle,
        scheduledAt,
        amount,
        chargeAmount,
        discount,
        lat,
        lng,
        address,
      } = await resolveBookingDraft(userId, input)

      const bookingDate = getDateKeyFromScheduledAt(scheduledAt)
      log.info({ userId, vendorId: vendor.id, bookingDate, scheduledAt: scheduledAt.toISOString() }, 'booking:db_insert_start')

      const result =
        await bookingsRepository.createBookingWithPayment({
          userId,
          vendorId: vendor.id,
          items,
          vehicleId: vehicle.id,
          bookingType: input.bookingType,
          scheduledAt,
          durationMins,
          subtotalAmount: amount,
          amount: chargeAmount,
          paymentMethod: input.paymentMethod,
          lat,
          lng,
          address,
          discount,
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

      // The limits were re-checked under a lock inside the transaction, so a
      // code that was free a moment ago can still be gone by the time we write.
      if (result.discountUnavailable) {
        log.warn(
          { userId, code: input.discountCode },
          'booking:discount_exhausted_at_write'
        )
        throw new AppError(
          409,
          'That code was just fully redeemed. Please try again without it.',
          'DISCOUNT_EXHAUSTED'
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
        serviceIds: input.serviceIds,
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
        serviceIds: input.serviceIds,
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

    // A move re-books exactly what was sold, so the lines come off the booking
    // rather than being re-resolved: a service repriced or deactivated since
    // must not change (or block) a booking the customer has already paid for.
    const items = booking.items ?? []
    if (items.length === 0) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }

    const durationMins =
      booking.durationMins ??
      items.reduce((total, item) => total + item.durationMins, 0)

    await validateSlotAvailability(
      booking.vendorId,
      items.map((item) => item.serviceId),
      newScheduledAt,
      durationMins
    )

    const rootBookingId = booking.originalBookingId ?? booking.id

    const result = await bookingsRepository.rescheduleBookingWithPayment({
      sourceBookingId: booking.id,
      rootBookingId,
      userId,
      vendorId: booking.vendorId,
      items: items.map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        amount: item.amount,
        durationMins: item.durationMins,
      })),
      vehicleId: booking.vehicleId,
      bookingType: booking.bookingType,
      newScheduledAt,
      durationMins,
      status: booking.status,
      subtotalAmount: booking.subtotalAmount ?? booking.amount,
      amount: booking.amount,
      discountAmount: booking.discountAmount ?? '0.00',
      discountId: booking.discountId ?? null,
      discountCode: booking.discountCode ?? null,
      discountFundedBy: booking.discountFundedBy ?? null,
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

  async listVendorBookings(vendorId: string, query: ListVendorBookingsQuery) {
    const vendor = await getTenantVendor(vendorId)
    const bookings = await bookingsRepository.listBookingsForVendor(
      vendor.id,
      query.status
    )

    return bookings.map(toVendorBookingResponse)
  },

  async acceptBooking(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be accepted',
        'INVALID_BOOKING_STATUS'
      )
    }

    // Belt and braces with the payment filter in listBookingsForVendor: a
    // vendor must never be able to commit to a job that has not been paid for,
    // whichever route the booking id arrived by.
    if (
      !booking.payment ||
      !['paid', 'collected'].includes(booking.payment.status)
    ) {
      throw new AppError(
        400,
        'This booking has not been paid for yet',
        'BOOKING_NOT_PAID'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'confirmed', {
      acceptedBy: actorId,
    })
    log.info({ bookingId, vendorId, actorId, status: 'confirmed' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toVendorBookingResponse(updated!)
  },

  async rejectBooking(
    vendorId: string,
    actorId: string,
    bookingId: string,
    reason?: string
  ) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'pending') {
      throw new AppError(
        400,
        'Only pending bookings can be rejected',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.cancelBooking(bookingId, 'vendor', reason)
    log.info({ bookingId, vendorId, actorId, status: 'cancelled', cancelledBy: 'vendor' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toVendorBookingResponse(updated!)
  },

  async markInProgress(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'confirmed') {
      throw new AppError(
        400,
        'Only confirmed bookings can be marked in progress',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'in_progress')
    log.info({ bookingId, vendorId, actorId, status: 'in_progress' }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toVendorBookingResponse(updated!)
  },

  async markCompleted(vendorId: string, actorId: string, bookingId: string) {
    const { booking } = await getBookingForVendor(vendorId, bookingId)

    if (booking.status !== 'in_progress') {
      throw new AppError(
        400,
        'Only in-progress bookings can be completed',
        'INVALID_BOOKING_STATUS'
      )
    }

    await bookingsRepository.updateBookingStatus(bookingId, 'completed', {
      completedBy: actorId,
    })

    if (booking.paymentMethod === 'cash') {
      await bookingsRepository.updatePaymentStatus(bookingId, 'collected', new Date())
    }

    log.info({ bookingId, vendorId, actorId, status: 'completed', paymentMethod: booking.paymentMethod }, 'booking:status_updated')

    const updated = await bookingsRepository.findBookingById(bookingId)
    return toVendorBookingResponse(updated!)
  },
}
