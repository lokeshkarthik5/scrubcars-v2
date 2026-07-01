'use client'

import { create } from 'zustand'
import {
  createBooking as apiCreateBooking,
  getCustomerBookings,
  getVendorBookings,
  updateBookingStatus,
  type CreateBookingPayload,
} from '@/lib/api/bookings'
import type { Booking } from '@/lib/types'

interface BookingsState {
  customerBookings: Booking[]
  vendorBookings: Booking[]
  isLoading: boolean

  fetchCustomerBookings: () => Promise<Booking[]>
  fetchVendorBookings: () => Promise<Booking[]>
  createBooking: (payload: CreateBookingPayload) => Promise<Booking>
  updateStatus: (id: string, status: Booking['status']) => Promise<Booking>
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
    const booking = await apiCreateBooking(payload)
    set((state) => ({
      customerBookings: [booking, ...state.customerBookings],
    }))
    return booking
  },

  async updateStatus(id, status) {
    const booking = await updateBookingStatus(id, status)
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
