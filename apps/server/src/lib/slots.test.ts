import { describe, expect, it } from 'bun:test'
import {
  computeAvailableSlots,
  filterByMinNotice,
  generateSlotStartTimes,
  meetsMinNotice,
  minNoticeMessage,
} from './slots.js'

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

describe('minimum notice', () => {
  // 10:15 IST on the open day, fixed so the tests do not read the clock.
  const NOW = new Date('2026-09-01T10:15:00+05:30').getTime()
  const day = computeAvailableSlots({ ...OPEN_DAY, intervalMins: 30, serviceDurationMins: 60 })
  const ist = (time: string) => new Date(`2026-09-01T${time}+05:30`).toISOString()

  it('offers at-garage slots from two hours out', () => {
    const slots = filterByMinNotice(day, 'dropin', NOW)
    expect(slots[0]).toBe(ist('12:30:00'))
  })

  it('offers doorstep slots from three hours out', () => {
    const slots = filterByMinNotice(day, 'doorstep', NOW)
    expect(slots[0]).toBe(ist('13:30:00'))
  })

  it('counts a start exactly on the line as enough notice', () => {
    expect(meetsMinNotice(new Date(NOW + 2 * 3_600_000), 'dropin', NOW)).toBe(true)
    expect(meetsMinNotice(new Date(NOW + 2 * 3_600_000 - 1), 'dropin', NOW)).toBe(false)
  })

  it('leaves a later day untouched', () => {
    const tomorrow = computeAvailableSlots({
      ...OPEN_DAY,
      date: '2026-09-02',
      serviceDurationMins: 60,
    })
    expect(filterByMinNotice(tomorrow, 'doorstep', NOW)).toEqual(tomorrow)
  })

  it('can empty a day whose job still fits, which is not "too long for the day"', () => {
    const lateEvening = new Date('2026-09-01T16:30:00+05:30').getTime()
    expect(day.length).toBeGreaterThan(0)
    expect(filterByMinNotice(day, 'dropin', lateEvening)).toEqual([])
  })

  it('reaches across midnight for a garage open early', () => {
    const late = new Date('2026-09-01T23:00:00+05:30').getTime()
    const early = computeAvailableSlots({
      date: '2026-09-02',
      openTime: '00:00:00',
      closeTime: '06:00:00',
      intervalMins: 60,
      isClosed: false,
      serviceDurationMins: 60,
    })
    const slots = filterByMinNotice(early, 'doorstep', late)
    expect(slots[0]).toBe(new Date('2026-09-02T02:00:00+05:30').toISOString())
  })

  it('says how much notice each kind of booking needs', () => {
    expect(minNoticeMessage('dropin')).toContain('2 hours')
    expect(minNoticeMessage('doorstep')).toContain('3 hours')
  })
})
