import { describe, expect, test } from 'bun:test'
import {
  defaultWashIntervalDays,
  isMonsoon,
  isWashDue,
  washedAt,
  washStatus,
  WASH_INTERVAL_CHOICES,
} from './wash-status.js'

// Every clock here is fixed. IST is UTC+05:30, so 18:30 UTC is midnight IST.

const at = (iso: string) => new Date(iso)

describe('the default interval', () => {
  test('is 14 days, and 10 from 1 October to 31 December, by the IST date', () => {
    // 30 Sep 23:59 IST, then 1 Oct 00:00 IST.
    expect(defaultWashIntervalDays(at('2026-09-30T18:29:59.999Z'))).toBe(14)
    expect(defaultWashIntervalDays(at('2026-09-30T18:30:00.000Z'))).toBe(10)
    // 31 Dec 23:59 IST, then 1 Jan 00:00 IST.
    expect(defaultWashIntervalDays(at('2026-12-31T18:29:59.999Z'))).toBe(10)
    expect(defaultWashIntervalDays(at('2026-12-31T18:30:00.000Z'))).toBe(14)
    expect(isMonsoon(at('2026-11-15T06:00:00Z'))).toBe(true)
    expect(isMonsoon(at('2026-07-15T06:00:00Z'))).toBe(false)
  })

  test('the five intervals the app offers', () => {
    expect([...WASH_INTERVAL_CHOICES]).toEqual([7, 10, 14, 21, 30])
  })
})

describe('washStatus', () => {
  // Washed 1 Jul at 10:30 IST.
  const washed = at('2026-07-01T05:00:00Z')
  const status = (now: string, intervalDays: number | null = 10) =>
    washStatus({ intervalDays, lastWashAt: washed, bookedFor: null, now: at(now) })

  test('no wash yet is none, with nothing counted', () => {
    expect(washStatus({ intervalDays: null, lastWashAt: null, bookedFor: null, now: at('2026-07-01T05:00:00Z') }))
      .toMatchObject({ state: 'none', daysSinceWash: null, dueOn: null, daysLeft: null, intervalDays: 14, isDefaultInterval: true })
  })

  test('counts whole IST days to the due date', () => {
    expect(status('2026-07-04T05:00:00Z')).toMatchObject({ state: 'ok', daysSinceWash: 3, daysLeft: 7, dueOn: '2026-07-11' })
    // 8 days on a 10-day interval: due in 2 days.
    expect(status('2026-07-09T05:00:00Z')).toMatchObject({ state: 'due_soon', daysSinceWash: 8, daysLeft: 2 })
    expect(status('2026-07-10T05:00:00Z')).toMatchObject({ state: 'due_soon', daysLeft: 1 })
    expect(status('2026-07-11T05:00:00Z')).toMatchObject({ state: 'due_today', daysLeft: 0 })
    // 13 days: overdue by 3.
    expect(status('2026-07-14T05:00:00Z')).toMatchObject({ state: 'overdue', daysSinceWash: 13, daysLeft: -3 })
  })

  test('a day starts at midnight IST, not UTC', () => {
    // 18:45 UTC on 9 Jul is 00:15 IST on 10 Jul: a day later than 18:15 UTC.
    expect(status('2026-07-09T18:15:00Z').daysLeft).toBe(2)
    expect(status('2026-07-09T18:45:00Z').daysLeft).toBe(1)
    // A wash at 00:15 IST belongs to its IST day.
    const lateWash = washStatus({
      intervalDays: 7,
      lastWashAt: at('2026-07-01T18:45:00Z'),
      bookedFor: null,
      now: at('2026-07-02T06:00:00Z'),
    })
    expect(lateWash).toMatchObject({ daysSinceWash: 0, dueOn: '2026-07-09' })
  })

  test("the customer's interval wins over the default, monsoon or not", () => {
    const october = washStatus({ intervalDays: 21, lastWashAt: at('2026-10-01T05:00:00Z'), bookedFor: null, now: at('2026-10-12T05:00:00Z') })
    expect(october).toMatchObject({ intervalDays: 21, isDefaultInterval: false, state: 'ok', daysLeft: 10 })
    const defaulted = washStatus({ intervalDays: null, lastWashAt: at('2026-10-01T05:00:00Z'), bookedFor: null, now: at('2026-10-12T05:00:00Z') })
    expect(defaulted).toMatchObject({ intervalDays: 10, isDefaultInterval: true, state: 'overdue', daysLeft: -1 })
  })

  test('a paid booking coming up reads booked, never overdue', () => {
    const booked = washStatus({
      intervalDays: 10,
      lastWashAt: washed,
      bookedFor: { bookingId: 'b1', scheduledAt: at('2026-07-15T04:30:00Z') },
      now: at('2026-07-14T05:00:00Z'),
    })
    expect(booked).toMatchObject({
      state: 'booked',
      daysLeft: -3,
      bookedFor: { bookingId: 'b1', scheduledAt: '2026-07-15T04:30:00.000Z' },
    })
    expect(isWashDue(booked)).toBe(false)
  })

  test('due soon, due today and overdue are "wash due"; ok and none are not', () => {
    expect(isWashDue(status('2026-07-09T05:00:00Z'))).toBe(true)
    expect(isWashDue(status('2026-07-11T05:00:00Z'))).toBe(true)
    expect(isWashDue(status('2026-07-14T05:00:00Z'))).toBe(true)
    expect(isWashDue(status('2026-07-04T05:00:00Z'))).toBe(false)
    expect(isWashDue({ state: 'none' })).toBe(false)
  })
})

describe('washedAt', () => {
  test('is the completion time, or the slot for a job from before 0028', () => {
    const scheduledAt = at('2026-07-01T04:30:00Z')
    expect(washedAt({ completedAt: at('2026-07-01T06:00:00Z'), scheduledAt })).toEqual(at('2026-07-01T06:00:00Z'))
    expect(washedAt({ completedAt: null, scheduledAt })).toEqual(scheduledAt)
  })
})
