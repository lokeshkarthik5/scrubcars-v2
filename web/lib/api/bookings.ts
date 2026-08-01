import { apiClient } from './client'
import { mapBooking, mapSlots } from './mappers'
import type { ApiBooking, ApiSlotsResponse } from './types'
import type { Booking, BookingType, PaymentMethod } from '@/lib/types'

export interface CreateBookingPayload {
  vendorId: string
  serviceId: string
  scheduledAt: string
  bookingType: BookingType
  vehicleId: string
  addressId?: string
  paymentMethod: PaymentMethod
}

export interface SlotParams {
  vendorId: string
  serviceId: string
  date: string
}

export interface AvailableSlots {
  isClosed: boolean
  slots: ReturnType<typeof mapSlots>
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
      service_id: params.serviceId,
    },
  })
  return { isClosed: data.isClosed, slots: mapSlots(data.slots) }
}

/** POST /bookings */
export async function createBooking(
  payload: CreateBookingPayload
): Promise<Booking> {
  const booking = await apiClient<ApiBooking>('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      vendorId: payload.vendorId,
      serviceId: payload.serviceId,
      vehicleId: payload.vehicleId,
      bookingType: payload.bookingType,
      scheduledAt: payload.scheduledAt,
      paymentMethod: payload.paymentMethod,
      addressId: payload.addressId,
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
