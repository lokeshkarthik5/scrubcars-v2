import { apiClient } from './client'
import { mapBooking, mapSlots, mapVendorListItem } from './mappers'
import type { ApiBooking, ApiSlotsResponse, ApiVendorListItem } from './types'
import type { Booking, BookingReceipt, BookingType, PaymentMethod, Vendor } from '@repo/core/types'

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

/**
 * How a status change is sent, when the caller must pin it down: the
 * garage it acts for (captured when the button was pressed, so a switch
 * of garage in between cannot send it to another), and keepalive for one
 * sent as the page goes away.
 */
export interface StatusRequestOptions {
  vendorId?: string | null
  keepalive?: boolean
}

/** PATCH /bookings/:id/:action */
export async function updateBookingStatus(
  id: string,
  status: Booking['status'],
  reason?: string,
  options: StatusRequestOptions = {}
): Promise<Booking> {
  const action = STATUS_ENDPOINTS[status]
  if (!action) {
    throw new Error(`Unsupported status transition: ${status}`)
  }

  const booking = await apiClient<ApiBooking>(`/bookings/${id}/${action}`, {
    method: 'PATCH',
    ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    ...(options.vendorId ? { headers: { 'X-Vendor-Id': options.vendorId } } : {}),
    ...(options.keepalive ? { keepalive: true } : {}),
  })
  return mapBooking(booking)
}

// ─── Pickup & drop steps ─────────────────────────────────────────────────────
// Garage only. Picked up and Delivered take the customer's 4-digit code; a
// wrong one is a 400 (HANDOVER_CODE_WRONG, saying the tries left) and too
// many a 409 (HANDOVER_CODE_LOCKED), when Detlio has to confirm it.

/** The garage's own header and keepalive, as on a status change (0066: these wait behind Undo too). */
function stepInit(options: StatusRequestOptions) {
  return {
    ...(options.vendorId ? { headers: { 'X-Vendor-Id': options.vendorId } } : {}),
    ...(options.keepalive ? { keepalive: true } : {}),
  }
}

/** PATCH /bookings/:id/picked-up — the garage has the car. */
export async function markPickedUp(id: string, code: string, options: StatusRequestOptions = {}): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${id}/picked-up`, {
    method: 'PATCH',
    body: JSON.stringify({ code }),
    ...stepInit(options),
  })
  return mapBooking(booking)
}

/** PATCH /bookings/:id/at-garage — the car has arrived at the garage. */
export async function markAtGarage(id: string, options: StatusRequestOptions = {}): Promise<Booking> {
  return mapBooking(await apiClient<ApiBooking>(`/bookings/${id}/at-garage`, { method: 'PATCH', ...stepInit(options) }))
}

/** PATCH /bookings/:id/out-for-delivery — the work is done, the car is on its way back. */
export async function markOutForDelivery(id: string, options: StatusRequestOptions = {}): Promise<Booking> {
  return mapBooking(
    await apiClient<ApiBooking>(`/bookings/${id}/out-for-delivery`, { method: 'PATCH', ...stepInit(options) })
  )
}

/** PATCH /bookings/:id/delivered — the customer has the car back; completes the job. */
export async function markDelivered(id: string, code: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${id}/delivered`, {
    method: 'PATCH',
    body: JSON.stringify({ code }),
  })
  return mapBooking(booking)
}

/**
 * PATCH /bookings/:id/garage-cancel — the garage cancels a booking it
 * accepted, before the job starts (0066). The reason is required.
 */
export async function garageCancelBooking(id: string, reason: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${id}/garage-cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
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

// ─── Suggest another time (0041) ─────────────────────────────────────────────

/**
 * GET /vendors/me/bookings/:id/time-proposal/slots — the garage's own free
 * times on a day for this booking's job (same services, length, type and
 * notice), without the booked time itself.
 */
export async function getProposalSlots(bookingId: string, date: string): Promise<AvailableSlots> {
  const data = await apiClient<ApiSlotsResponse>(`/vendors/me/bookings/${bookingId}/time-proposal/slots`, {
    params: { date },
  })
  return {
    isClosed: data.isClosed,
    slots: mapSlots(data.slots),
    durationMins: data.durationMins ?? 0,
    fitsInDay: data.fitsInDay ?? data.slots.length > 0,
    closedReason: data.closedReason ?? null,
    paused: data.paused ?? false,
    allBooked: data.slots.length === 0 && (data.fullSlots ?? 0) > 0,
  }
}

/** POST /vendors/me/bookings/:id/time-proposal — offer one to three other times. */
export async function suggestTimes(bookingId: string, slots: string[], note?: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/vendors/me/bookings/${bookingId}/time-proposal`, {
    method: 'POST',
    body: JSON.stringify({ slots, ...(note ? { note } : {}) }),
  })
  return mapBooking(booking)
}

/** POST /vendors/me/bookings/:id/time-proposal/withdraw — the booking goes back to waiting. */
export async function withdrawTimeProposal(bookingId: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/vendors/me/bookings/${bookingId}/time-proposal/withdraw`, {
    method: 'POST',
  })
  return mapBooking(booking)
}

/**
 * POST /bookings/:id/time-proposal/choose — the customer picks one of the
 * garage's times. Answers the moved booking, already accepted, under a new id.
 * A time taken meanwhile is a 409 TIME_PROPOSAL_SLOT_GONE.
 */
export async function chooseProposedTime(bookingId: string, slot: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${bookingId}/time-proposal/choose`, {
    method: 'POST',
    body: JSON.stringify({ slot }),
  })
  return mapBooking(booking)
}

/** POST /bookings/:id/time-proposal/decline — none work: cancelled with a full refund. */
export async function declineProposedTimes(bookingId: string): Promise<Booking> {
  const booking = await apiClient<ApiBooking>(`/bookings/${bookingId}/time-proposal/decline`, {
    method: 'POST',
  })
  return mapBooking(booking)
}

/** Other garages for a booking its garage did not accept in time (0042). */
export interface OtherGarages {
  /** The booking's type, carried into each garage's link. */
  bookingType: BookingType
  /** Up to three of the garage list's cards, nearest first. */
  vendors: Vendor[]
}

/**
 * GET /bookings/:id/other-garages — "Book another garage": up to three
 * nearby live garages that take the same booking type and offer one of the
 * booked services' kinds. Empty for any booking its garage did not miss.
 */
export async function getOtherGarages(bookingId: string): Promise<OtherGarages> {
  const data = await apiClient<{ bookingType: BookingType; items: ApiVendorListItem[] }>(
    `/bookings/${bookingId}/other-garages`
  )
  return { bookingType: data.bookingType, vendors: data.items.map(mapVendorListItem) }
}
