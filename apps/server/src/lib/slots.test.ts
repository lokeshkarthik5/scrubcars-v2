import { describe, expect, it } from 'bun:test'
import { computeAvailableSlots, generateSlotStartTimes } from './slots.js'

// With several services in one booking, `serviceDurationMins` is their sum —
// which makes "does this booking fit the day at all?" a question the picker
// can now answer no to. These pin that behaviour down.

const OPEN_DAY = {
  date: '2026-09-01',
  openTime: '09:00:00',
  closeTime: '18:00:00',
  intervalMins: 60,
  isClosed: false,
}

describe('generateSlotStartTimes', () => {
  it('stops early enough that a full interval fits before closing', () => {
    const starts = generateSlotStartTimes('09:00:00', '12:00:00', 60)
    expect(starts).toEqual(['09:00:00', '10:00:00', '11:00:00'])
  })
})

describe('computeAvailableSlots', () => {
  it('offers every slot whose job finishes before closing', () => {
    const slots = computeAvailableSlots({ ...OPEN_DAY, serviceDurationMins: 60 })
    // 09:00 through 17:00 — a 60-minute job started at 17:00 ends exactly at
    // close, which counts.
    expect(slots).toHaveLength(9)
    expect(slots[0]).toBe(new Date('2026-09-01T09:00:00+05:30').toISOString())
  })

  it('drops the late slots a longer combined booking cannot finish', () => {
    // Three services at 90 minutes each: the last start that still fits a
    // 4h30m job in a 9am–6pm day is 13:30, and slots are hourly.
    const slots = computeAvailableSlots({
      ...OPEN_DAY,
      serviceDurationMins: 270,
    })
    expect(slots).toHaveLength(5)
    expect(slots.at(-1)).toBe(new Date('2026-09-01T13:00:00+05:30').toISOString())
  })

  it('offers nothing when the services cannot fit the day at all', () => {
    // This is the case that used to render an empty picker with no
    // explanation: the customer can retry all afternoon and never succeed.
    expect(
      computeAvailableSlots({ ...OPEN_DAY, serviceDurationMins: 600 })
    ).toEqual([])
  })

  it('offers nothing on a closed day', () => {
    expect(
      computeAvailableSlots({
        ...OPEN_DAY,
        isClosed: true,
        serviceDurationMins: 60,
      })
    ).toEqual([])
  })
})
