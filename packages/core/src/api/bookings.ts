import { apiClient } from './client'
import { mapBooking, mapSlots } from './mappers'
import type { ApiBooking, ApiSlotsResponse } from './types'
import type { Booking, BookingReceipt, BookingType, PaymentMethod } from '@repo/core/types'

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
  /**
   * The customer's booking being moved, when this list is for a reschedule.
   * It still holds its current time, and without this it would count against
   * the garage and hide the times around itself.
   */
  rescheduleOf?: string
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
  /** Why a closed day is closed, when it is. */
  closedReason: 'holiday' | 'weekly_off' | null
  /** The garage is not taking new bookings at all right now. */
  paused: boolean
  /**
   * Every time with enough notice is already booked up. Distinct from an
   * evening with no time left, which is about the clock, not the garage.
   */
  allBooked: boolean
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * GET /vendors/:vendorId/slots, or for a reschedule
 * GET /vendors/:vendorId/slots/reschedule/:bookingId — the signed-in variant,
 * since it names one of the customer's bookings.
 */
export async function getAvailableSlots(params: SlotParams): Promise<AvailableSlots> {
  const date = params.date === 'today' ? todayDateString() : params.date
  const path = params.rescheduleOf
    ? `/vendors/${params.vendorId}/slots/reschedule/${params.rescheduleOf}`
    : `/vendors/${params.vendorId}/slots`
  const data = await apiClient<ApiSlotsResponse>(path, {
    auth: Boolean(params.rescheduleOf),
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
    // All three absent from a server older than capacity and holidays, which
    // had none of these states to report.
    closedReason: data.closedReason ?? null,
    paused: data.paused ?? false,
    allBooked: data.slots.length === 0 && (data.fullSlots ?? 0) > 0,
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

/**
 * GET /bookings/:id/receipt — the customer's payment receipt. Throws the
 * ApiError as it came: the page tells "no receipt yet"
 * (RECEIPT_NOT_AVAILABLE) apart from "not found".
 */
export async function getBookingReceipt(id: string): Promise<BookingReceipt> {
  return apiClient<BookingReceipt>(`/bookings/${id}/receipt`)
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

/**
 * POST /bookings/:id/review-prompt/dismiss — the × on Home's "Rate your
 * wash". Only the booking's customer can; anyone else gets the booking's 404.
 * The review itself can still be left from the booking's page.
 */
export async function dismissReviewPrompt(bookingId: string): Promise<void> {
  await apiClient(`/bookings/${bookingId}/review-prompt/dismiss`, { method: 'POST' })
}
