'use client'

import { create } from 'zustand'
import {
  cancelBooking as apiCancelBooking,
  createBooking as apiCreateBooking,
  rescheduleBooking as apiRescheduleBooking,
  getCustomerBookings,
  getVendorBookings,
  updateBookingStatus,
  type CreateBookingPayload,
  type StatusRequestOptions,
} from '@repo/core/api/bookings'
import type { Booking } from '@repo/core/types'

const bookingRequests = new Map<string, Promise<Booking>>()

/**
 * Bumped as a status change starts and again as it lands. A job-list read
 * that started before the latest change carries the status from before it,
 * so it is dropped rather than put back over the change (a 10-second poll
 * landing just after an Accept used to restore the old status).
 */
let statusWrites = 0

function bookingRequestKey(payload: CreateBookingPayload) {
  return [
    payload.vendorId,
    payload.serviceIds.join(','),
    payload.scheduledAt,
    payload.bookingType,
    payload.vehicleId,
    payload.addressId ?? '',
    payload.paymentMethod,
    // Without the code, a discounted retry would be deduped against the
    // full-price attempt that preceded it.
    payload.discountCode ?? '',
  ].join('|')
}

interface BookingsState {
  customerBookings: Booking[]
  vendorBookings: Booking[]
  isLoading: boolean

  fetchCustomerBookings: () => Promise<Booking[]>
  fetchVendorBookings: () => Promise<Booking[]>
  createBooking: (payload: CreateBookingPayload) => Promise<Booking>
  cancelBooking: (id: string, reason?: string) => Promise<Booking>
  rescheduleBooking: (id: string, scheduledAt: string, reason?: string) => Promise<Booking>
  updateStatus: (
    id: string,
    status: Booking['status'],
    reason?: string,
    options?: StatusRequestOptions
  ) => Promise<Booking>
  reset: () => void
}

export const useBookingsStore = create<BookingsState>((set) => ({
  customerBookings: [],
  vendorBookings: [],
  isLoading: false,

  async fetchCustomerBookings() {
    set({ isLoading: true })
    try {
      const bookings = await getCustomerBookings()
      set({ customerBookings: bookings })
      return bookings
    } finally {
      set({ isLoading: false })
    }
  },

  async fetchVendorBookings() {
    set({ isLoading: true })
    const startedAt = statusWrites
    try {
      const bookings = await getVendorBookings()
      if (startedAt === statusWrites) set({ vendorBookings: bookings })
      return bookings
    } finally {
      set({ isLoading: false })
    }
  },

  async createBooking(payload) {
    const key = bookingRequestKey(payload)
    const existingRequest = bookingRequests.get(key)

    if (existingRequest) {
      return existingRequest
    }

    const request = apiCreateBooking(payload)
      .then((booking) => {
        set((state) => ({
          customerBookings: state.customerBookings.some((b) => b.id === booking.id)
            ? state.customerBookings
            : [booking, ...state.customerBookings],
        }))
        return booking
      })
      .finally(() => {
        bookingRequests.delete(key)
      })

    bookingRequests.set(key, request)
    return request
  },

  async cancelBooking(id, reason) {
    const booking = await apiCancelBooking(id, reason)
    set((state) => ({
      customerBookings: state.customerBookings.map((b) =>
        b.id === id ? booking : b
      ),
    }))
    return booking
  },

  async rescheduleBooking(id, scheduledAt, reason) {
    // The API returns a NEW booking; the old one is retired server-side.
    const booking = await apiRescheduleBooking(id, scheduledAt, reason)
    set((state) => ({
      customerBookings: [
        booking,
        ...state.customerBookings.filter((b) => b.id !== id),
      ],
    }))
    return booking
  },

  async updateStatus(id, status, reason, options) {
    statusWrites++
    const booking = await updateBookingStatus(id, status, reason, options).finally(() => {
      statusWrites++
    })
    set((state) => ({
      vendorBookings: state.vendorBookings.map((b) =>
        b.id === id ? booking : b
      ),
    }))
    return booking
  },

  reset() {
    set({ customerBookings: [], vendorBookings: [] })
  },
}))
