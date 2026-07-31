'use client'

import { create } from 'zustand'
import {
  cancelBooking as apiCancelBooking,
  createBooking as apiCreateBooking,
  getCustomerBookings,
  getVendorBookings,
  updateBookingStatus,
  type CreateBookingPayload,
} from '@/lib/api/bookings'
import type { Booking } from '@/lib/types'

const bookingRequests = new Map<string, Promise<Booking>>()

function bookingRequestKey(payload: CreateBookingPayload) {
  return [
    payload.vendorId,
    payload.serviceId,
    payload.scheduledAt,
    payload.bookingType,
    payload.vehicleId,
    payload.addressId ?? '',
    payload.paymentMethod,
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
  updateStatus: (id: string, status: Booking['status'], reason?: string) => Promise<Booking>
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
    try {
      const bookings = await getVendorBookings()
      set({ vendorBookings: bookings })
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

  async updateStatus(id, status, reason) {
    const booking = await updateBookingStatus(id, status, reason)
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
