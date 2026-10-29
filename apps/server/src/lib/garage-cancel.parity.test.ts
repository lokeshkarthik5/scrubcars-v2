import { describe, expect, test } from 'bun:test'
import * as server from './garage-cancel.js'

// The portal's twin lives in packages/core, loaded by path at run time (a
// computed specifier, so the server's build never compiles it). The portal
// warns "counts as a missed booking" from it; a drift would warn about one
// window and count another.
const coreUrl = (file: string) => new URL(`../../../../packages/core/src/${file}`, import.meta.url).href

interface CoreGarageCancel {
  GARAGE_CANCEL_LATE_HOURS: number
  GARAGE_CANCEL_REASON_MIN: number
  GARAGE_CANCEL_REASON_MAX: number
  isLateGarageCancel: (scheduledAt: Date, cancelledAt: Date) => boolean
  canGarageCancel: (booking: { status: string; bookingType: string; pickup?: { nextStep?: string | null } | null }) => boolean
}

describe('garage cancel parity (0066)', () => {
  test('the same numbers', async () => {
    const core = (await import(coreUrl('garage-cancel.ts'))) as CoreGarageCancel
    expect(core.GARAGE_CANCEL_LATE_HOURS).toBe(server.GARAGE_CANCEL_RULES.lateWindowHours)
    expect(core.GARAGE_CANCEL_REASON_MIN).toBe(server.GARAGE_CANCEL_RULES.reasonMinLength)
    expect(core.GARAGE_CANCEL_REASON_MAX).toBe(server.GARAGE_CANCEL_RULES.reasonMaxLength)
  })

  test('the same late rule, either side of the 24 hours', async () => {
    const core = (await import(coreUrl('garage-cancel.ts'))) as CoreGarageCancel
    const slot = new Date('2026-11-02T04:30:00Z')
    for (const hoursBefore of [-2, 0, 1, 23.99, 24, 24.01, 72]) {
      const at = new Date(slot.getTime() - hoursBefore * 3_600_000)
      expect(core.isLateGarageCancel(slot, at)).toBe(server.isLateGarageCancel(slot, at))
    }
  })

  test('the portal offers Cancel exactly when the server would take it', async () => {
    const core = (await import(coreUrl('garage-cancel.ts'))) as CoreGarageCancel
    const cases = [
      { status: 'confirmed', bookingType: 'dropin', pickup: null, pickedUpAt: null },
      { status: 'confirmed', bookingType: 'pickup', pickup: { nextStep: 'picked_up' }, pickedUpAt: null },
      { status: 'confirmed', bookingType: 'pickup', pickup: { nextStep: 'at_garage' }, pickedUpAt: new Date() },
      { status: 'pending', bookingType: 'dropin', pickup: null, pickedUpAt: null },
      { status: 'in_progress', bookingType: 'doorstep', pickup: null, pickedUpAt: null },
      { status: 'completed', bookingType: 'dropin', pickup: null, pickedUpAt: null },
    ]
    for (const booking of cases) {
      expect(core.canGarageCancel(booking)).toBe(server.garageCancelRefusal(booking) === null)
    }
  })
})
