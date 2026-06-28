import { apiClient } from './client'
import {
  MOCK_BOOKINGS,
  MOCK_SLOTS,
  MOCK_VENDOR_BOOKINGS,
} from '@/lib/mock/data'
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

/** GET /vendors/:vendorId/slots */
export async function getAvailableSlots(params: SlotParams) {
  // TODO: return apiClient('/vendors/${params.vendorId}/slots', { params })
  void params
  return MOCK_SLOTS
}

/** POST /bookings */
export async function createBooking(
  payload: CreateBookingPayload
): Promise<Booking> {
  // TODO: return apiClient<Booking>('/bookings', { method: 'POST', body: JSON.stringify(payload) })
  void payload
  return MOCK_BOOKINGS[0]
}

/** GET /bookings */
export async function getCustomerBookings(): Promise<Booking[]> {
  // TODO: return apiClient<Booking[]>('/bookings')
  return MOCK_BOOKINGS
}

/** GET /bookings/:id */
export async function getBooking(id: string): Promise<Booking | undefined> {
  // TODO: return apiClient<Booking>(`/bookings/${id}`)
  return MOCK_BOOKINGS.find((b) => b.id === id)
}

/** GET /vendor/bookings */
export async function getVendorBookings(): Promise<Booking[]> {
  // TODO: return apiClient<Booking[]>('/vendor/bookings')
  return MOCK_VENDOR_BOOKINGS
}

/** PATCH /vendor/bookings/:id/status */
export async function updateBookingStatus(
  id: string,
  status: Booking['status']
): Promise<Booking> {
  // TODO: return apiClient<Booking>(`/vendor/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  const booking = MOCK_VENDOR_BOOKINGS.find((b) => b.id === id)
  return { ...booking!, status }
}
