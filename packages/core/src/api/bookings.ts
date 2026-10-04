import { apiClient } from './client'
import { mapBooking, mapSlots } from './mappers'
import type { ApiBooking, ApiSlotsResponse } from './types'
import type { Booking, BookingType, PaymentMethod } from '@repo/core/types'

export interface CreateBookingPayload {
  vendorId: string
  /** The services being booked, in the order the customer picked them. */
  serviceIds: string[]
  scheduledAt: string
  bookingType: BookingType
  vehicleId: string
  addressId?: string
  paymentMethod: PaymentMethod
  /** Promo code, if the customer applied one. The server re-resolves it. */
  discountCode?: string
}

export interface SlotParams {
  vendorId: string
  /** Slots must fit every service booked together, so this is the whole cart. */
  serviceIds: string[]
  date: string
  /** Doorstep needs more notice than at-garage, so the list depends on it. */
  bookingType: BookingType
}

export interface AvailableSlots {
  isClosed: boolean
  slots: ReturnType<typeof mapSlots>
  /** Combined duration of the requested services, as the server computed it. */
  durationMins: number
  /**
   * Whether the combined duration fits the day at all, before past times are
   * filtered out. `slots` being empty means either "nothing left today" or
   * "this list of services never fits", and only the second is worth telling
   * the customer about — they can act on it.
   */
  fitsInDay: boolean
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** GET /vendors/:vendorId/slots */
export async function getAvailableSlots(params: SlotParams): Promise<AvailableSlots> {
  const date = params.date === 'today' ? todayDateString() : params.date
  const data = await apiClient<ApiSlotsResponse>(`/vendors/${params.vendorId}/slots`, {
    auth: false,
    params: {
      date,
      // Comma-separated: one id is still exactly the old request.
      service_id: params.serviceIds.join(','),
      booking_type: params.bookingType,
    },
  })
  return {
    isClosed: data.isClosed,
    slots: mapSlots(data.slots),
    durationMins: data.durationMins ?? 0,
    // The server now drops times too soon to book, so an evening can come
    // back empty although the job fits: only its own fitsInDay tells the two
    // apart. An older server sends the whole day, where the length still does.
    fitsInDay: data.fitsInDay ?? data.slots.length > 0,
  }
}

/** POST /bookings */
export async function createBooking(
  payload: CreateBookingPayload
): Promise<Booking> {
  const booking = await apiClient<ApiBooking>('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      vendorId: payload.vendorId,
      serviceIds: payload.serviceIds,
      vehicleId: payload.vehicleId,
      bookingType: payload.bookingType,
      scheduledAt: payload.scheduledAt,
      paymentMethod: payload.paymentMethod,
      addressId: payload.addressId,
      discountCode: payload.discountCode,
    }),
  })
  return mapBooking(booking)
}

/** GET /bookings/me */
export async function getCustomerBookings(): Promise<Booking[]> {
  const bookings = await apiClient<ApiBooking[]>('/bookings/me')
  return bookings.map(mapBooking)
}

/** GET /bookings/:id */
export async function getBooking(id: string): Promise<Booking | undefined> {
  try {
    const booking = await apiClient<ApiBooking>(`/bookings/${id}`)
    return mapBooking(booking)
  } catch {
    return undefined
  }
}

/** GET /bookings/vendor */
export async function getVendorBookings(): Promise<Booking[]> {
  const bookings = await apiClient<ApiBooking[]>('/bookings/vendor')
  return bookings.map(mapBooking)
}

const STATUS_ENDPOINTS: Partial<Record<Booking['status'], string>> = {
  confirmed: 'accept',
  cancelled: 'reject',
  in_progress: 'progress',
  completed: 'complete',
}

/** PATCH /bookings/:id/:action */
export async function updateBookingStatus(
  id: string,
  status: Booking['status'],
  reason?: string
): Promise<Booking> {
  const action = STATUS_ENDPOINTS[status]
  if (!action) {
    throw new Error(`Unsupported status transition: ${status}`)
  }

  const booking = await apiClient<ApiBooking>(`/bookings/${id}/${action}`, {
    method: 'PATCH',
    ...(reason ? { body: JSON.stringify({ reason }) } : {}),
  })
  return mapBooking(booking)
}

/** PATCH /bookings/:id/cancel */
export async function cancelBooking(id: string, reason?: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${id}/cancel`, {
    method: 'PATCH',
    ...(reason ? { body: JSON.stringify({ reason }) } : {}),
  })
  return mapBooking(booking)
}

/**
 * PATCH /bookings/:id/reschedule
 * Creates a NEW booking at the given slot and retires the old one. Returns the
 * new booking (with a fresh id).
 */
export async function rescheduleBooking(
  id: string,
  scheduledAt: string,
  reason?: string
): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduledAt, ...(reason ? { reason } : {}) }),
  })
  return mapBooking(booking)
}
