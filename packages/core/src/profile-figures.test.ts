import { describe, expect, test } from 'bun:test'
import type { Booking } from './types'
import { bookingFigures } from './profile-figures'

const NOW = Date.parse('2026-11-22T06:00:00Z')
const b = (status: Booking['status'], at: string, vendorId = 'v1') =>
  ({ id: `${status}-${at}-${vendorId}`, status, scheduledAt: at, vendorId }) as unknown as Booking

describe('bookingFigures', () => {
  test('counts every booking but the cancelled ones', () => {
    const f = bookingFigures([b('completed', '2026-11-01T05:00:00Z'), b('cancelled', '2026-11-02T05:00:00Z'), b('confirmed', '2026-11-25T05:00:00Z')], NOW)
    expect(f.count).toBe(2)
  })

  test('garages tried are the ones with a finished job, each once', () => {
    const f = bookingFigures(
      [b('completed', '2026-11-01T05:00:00Z', 'a'), b('completed', '2026-11-03T05:00:00Z', 'a'), b('completed', '2026-11-04T05:00:00Z', 'b'), b('confirmed', '2026-11-25T05:00:00Z', 'c')],
      NOW
    )
    expect(f.garagesTried).toBe(2)
  })

  test('the next booking is the soonest one still to come', () => {
    const later = b('confirmed', '2026-11-28T05:00:00Z')
    const soon = b('pending', '2026-11-24T05:00:00Z')
    expect(bookingFigures([later, soon, b('completed', '2026-11-20T05:00:00Z')], NOW).next).toBe(soon)
  })

  test('nothing coming up is null', () => {
    expect(bookingFigures([b('completed', '2026-11-20T05:00:00Z')], NOW).next).toBeNull()
  })
})
