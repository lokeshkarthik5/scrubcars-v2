import { describe, expect, mock, test } from 'bun:test'
import type { Booking } from '@repo/core/types'

// The list read is held open by the test; the status change answers at once.
let releaseList: (list: Booking[]) => void = () => undefined
mock.module('@repo/core/api/bookings', () => ({
  getVendorBookings: () =>
    new Promise<Booking[]>((resolve) => (releaseList = resolve)),
  updateBookingStatus: async (id: string, status: Booking['status']) =>
    ({ id, status }) as Booking,
  getCustomerBookings: async () => [],
  createBooking: async () => ({}) as Booking,
  cancelBooking: async () => ({}) as Booking,
  rescheduleBooking: async () => ({}) as Booking,
}))

const { useBookingsStore } = await import('./bookings-store')

describe('the garage job list', () => {
  test('a read that started before a status change does not put the old status back', async () => {
    useBookingsStore.setState({
      vendorBookings: [{ id: 'b1', status: 'pending' } as Booking],
    })
    const read = useBookingsStore.getState().fetchVendorBookings()
    await useBookingsStore.getState().updateStatus('b1', 'confirmed')
    releaseList([{ id: 'b1', status: 'pending' } as Booking])
    await read
    expect(
      useBookingsStore.getState().vendorBookings.map((b) => b.status)
    ).toEqual(['confirmed'])
  })

  test('a read that started after it lands as usual', async () => {
    const read = useBookingsStore.getState().fetchVendorBookings()
    releaseList([{ id: 'b1', status: 'in_progress' } as Booking])
    await read
    expect(
      useBookingsStore.getState().vendorBookings.map((b) => b.status)
    ).toEqual(['in_progress'])
  })
})
