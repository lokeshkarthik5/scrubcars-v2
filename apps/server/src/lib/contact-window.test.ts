import { describe, expect, test } from 'bun:test'
import { contactWindow, type ContactWindowJob } from './contact-window.js'

const IST = (iso: string) => new Date(`${iso}+05:30`)
const SLOT = IST('2026-10-20T10:00:00')

function job(over: Partial<ContactWindowJob> = {}): ContactWindowJob {
  return { status: 'confirmed', bookingType: 'dropin', scheduledAt: SLOT, ...over }
}

const openAt = (j: ContactWindowJob, at: string) => contactWindow(j, IST(at)).open

describe('contact window: a booking still to happen', () => {
  test('opens exactly 2 hours before the slot', () => {
    const window = contactWindow(job(), IST('2026-10-20T07:00:00'))
    expect(window.opensAt).toBe(IST('2026-10-20T08:00:00').toISOString())
    expect(window.open).toBe(false)
    expect(openAt(job(), '2026-10-20T07:59:59')).toBe(false)
    expect(openAt(job(), '2026-10-20T08:00:00')).toBe(true)
    expect(openAt(job(), '2026-10-20T10:00:00')).toBe(true)
  })

  test('days before, it is closed', () => {
    expect(openAt(job(), '2026-10-18T10:00:00')).toBe(false)
    expect(openAt(job({ status: 'pending' }), '2026-10-19T10:00:00')).toBe(false)
  })

  test('pending is windowed the same as confirmed (the garage may call before accepting)', () => {
    expect(openAt(job({ status: 'pending' }), '2026-10-20T08:30:00')).toBe(true)
    expect(openAt(job({ status: 'pending' }), '2026-10-20T07:30:00')).toBe(false)
  })

  test('never started: closes 2 hours after the slot (no-show territory)', () => {
    const window = contactWindow(job(), IST('2026-10-20T11:00:00'))
    expect(window.closesAt).toBe(IST('2026-10-20T12:00:00').toISOString())
    expect(openAt(job(), '2026-10-20T11:59:59')).toBe(true)
    expect(openAt(job(), '2026-10-20T12:00:00')).toBe(false)
    expect(openAt(job({ status: 'pending' }), '2026-10-20T13:00:00')).toBe(false)
  })

  test('the same for doorstep and for a pickup not yet collected', () => {
    for (const bookingType of ['doorstep', 'pickup']) {
      expect(openAt(job({ bookingType }), '2026-10-20T07:59:00')).toBe(false)
      expect(openAt(job({ bookingType }), '2026-10-20T08:01:00')).toBe(true)
      expect(openAt(job({ bookingType }), '2026-10-20T12:01:00')).toBe(false)
    }
  })
})

describe('contact window: the job under way', () => {
  test('in progress is always inside, however early it started or long it runs', () => {
    const working = job({ status: 'in_progress' })
    expect(openAt(working, '2026-10-20T06:00:00')).toBe(true)
    expect(openAt(working, '2026-10-21T18:00:00')).toBe(true)
    expect(contactWindow(working, IST('2026-10-20T09:00:00')).closesAt).toBeNull()
  })

  test('pickup: every step from Picked up until Delivered is inside', () => {
    const collected = job({ bookingType: 'pickup', pickedUpAt: IST('2026-10-20T10:05:00') })
    // Picked up, then At garage: still 'confirmed'.
    expect(openAt(collected, '2026-10-20T15:00:00')).toBe(true)
    expect(contactWindow(collected, IST('2026-10-20T15:00:00')).closesAt).toBeNull()
    // Working, then Out for delivery: 'in_progress'.
    expect(openAt({ ...collected, status: 'in_progress' }, '2026-10-21T09:00:00')).toBe(true)
  })

  test('pickup: Delivered completes it, and the hour after counts from Delivered', () => {
    const delivered = job({
      bookingType: 'pickup',
      status: 'completed',
      pickedUpAt: IST('2026-10-20T10:05:00'),
      deliveredAt: IST('2026-10-20T17:00:00'),
      completedAt: IST('2026-10-20T17:00:00'),
    })
    expect(contactWindow(delivered, IST('2026-10-20T17:30:00')).closesAt).toBe(
      IST('2026-10-20T18:00:00').toISOString()
    )
    expect(openAt(delivered, '2026-10-20T17:59:59')).toBe(true)
    expect(openAt(delivered, '2026-10-20T18:00:00')).toBe(false)
  })
})

describe('contact window: after the job', () => {
  test('completed: open for 1 hour after completion, then closed', () => {
    const done = job({ status: 'completed', completedAt: IST('2026-10-20T11:00:00') })
    expect(openAt(done, '2026-10-20T11:30:00')).toBe(true)
    expect(openAt(done, '2026-10-20T11:59:59')).toBe(true)
    expect(openAt(done, '2026-10-20T12:00:00')).toBe(false)
    expect(openAt(done, '2026-10-25T12:00:00')).toBe(false)
  })

  test('completed early (started before the window): still the hour after', () => {
    const early = job({ status: 'completed', completedAt: IST('2026-10-20T07:00:00') })
    expect(openAt(early, '2026-10-20T07:30:00')).toBe(true)
    expect(openAt(early, '2026-10-20T08:00:00')).toBe(false)
  })

  test('completed with no time recorded (before 0028): its slot stands in', () => {
    const old = job({ status: 'completed', completedAt: null })
    expect(contactWindow(old, IST('2026-10-25T10:00:00'))).toMatchObject({
      open: false,
      closesAt: IST('2026-10-20T11:00:00').toISOString(),
    })
  })

  test('cancelled: closed at once, even inside the hours around the slot', () => {
    const cancelled = job({ status: 'cancelled', cancelledAt: IST('2026-10-20T09:30:00') })
    const window = contactWindow(cancelled, IST('2026-10-20T09:45:00'))
    expect(window.open).toBe(false)
    expect(window.closesAt).toBe(IST('2026-10-20T09:30:00').toISOString())
  })

  test('cancelled days ahead: closed, and closesAt is in the past (not "opens later")', () => {
    const now = IST('2026-10-18T12:00:00')
    const cancelled = job({ status: 'cancelled', cancelledAt: IST('2026-10-18T11:00:00') })
    const window = contactWindow(cancelled, now)
    expect(window.open).toBe(false)
    expect(new Date(window.closesAt!).getTime()).toBeLessThanOrEqual(now.getTime())
  })

  test('a cancellation with no time recorded is closed as of now', () => {
    const now = IST('2026-10-20T09:00:00')
    expect(contactWindow(job({ status: 'cancelled' }), now)).toMatchObject({
      open: false,
      closesAt: now.toISOString(),
    })
  })

  test('a no-show and a moved booking are closed, a collected pickup too once cancelled', () => {
    const now = IST('2026-10-20T10:30:00')
    expect(contactWindow(job({ status: 'cancelled', cancelledAt: now }), now).open).toBe(false)
    expect(contactWindow(job({ status: 'rescheduled' }), now).open).toBe(false)
    const collectedThenCancelled = job({
      bookingType: 'pickup',
      status: 'cancelled',
      pickedUpAt: IST('2026-10-20T10:05:00'),
      cancelledAt: now,
    })
    expect(contactWindow(collectedThenCancelled, now).open).toBe(false)
  })
})

describe('contact window: time zones', () => {
  test('a slot just after midnight IST opens the evening before', () => {
    const late = job({ scheduledAt: IST('2026-10-21T00:30:00') })
    expect(contactWindow(late, IST('2026-10-20T22:30:00')).opensAt).toBe('2026-10-20T17:00:00.000Z')
    expect(openAt(late, '2026-10-20T22:29:59')).toBe(false)
    expect(openAt(late, '2026-10-20T22:30:00')).toBe(true)
  })

  test('the answer is the same however the instant was written', () => {
    const utc = new Date('2026-10-20T02:30:00Z') // 08:00 IST, the opening
    const offset = new Date('2026-10-20T08:00:00+05:30')
    expect(contactWindow(job(), utc)).toEqual(contactWindow(job(), offset))
    expect(contactWindow(job(), utc).open).toBe(true)
  })

  test('a slot at 01:00 IST closes (never started) at 03:00 IST the same IST day', () => {
    const night = job({ scheduledAt: IST('2026-10-21T01:00:00') })
    expect(contactWindow(night, IST('2026-10-21T02:00:00')).closesAt).toBe('2026-10-20T21:30:00.000Z')
  })
})
