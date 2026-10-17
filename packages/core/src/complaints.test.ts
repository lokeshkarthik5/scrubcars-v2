import { describe, expect, test } from 'bun:test'
import {
  COMPLAINT_ACKNOWLEDGE_HOURS,
  COMPLAINT_RESOLVE_DAYS,
  complaintClockLine,
  complaintDueTimes,
  complaintDuration,
  complaintOverdue,
  complaintReceivedLine,
  formatComplaintDate,
  formatComplaintNumber,
  isComplaintOverdue,
} from './complaints'

const HOUR = 60 * 60 * 1000
const created = new Date('2026-10-17T04:30:00.000Z')
const at = (hours: number) => new Date(created.getTime() + hours * HOUR)

describe('formatComplaintNumber', () => {
  test('six digits, zero padded', () => {
    expect(formatComplaintNumber(1)).toBe('C-000001')
    expect(formatComplaintNumber(123)).toBe('C-000123')
    expect(formatComplaintNumber(999999)).toBe('C-999999')
  })

  test('a seventh digit is printed, never cut', () => {
    expect(formatComplaintNumber(1234567)).toBe('C-1234567')
  })
})

describe('the published promises', () => {
  test('are 24 hours and 7 days, as the Contact page says', () => {
    expect(COMPLAINT_ACKNOWLEDGE_HOURS).toBe(24)
    expect(COMPLAINT_RESOLVE_DAYS).toBe(7)
  })

  test('due times count from when it was made', () => {
    const due = complaintDueTimes(created)
    expect(due.acknowledgeBy.toISOString()).toBe('2026-10-18T04:30:00.000Z')
    expect(due.resolveBy.toISOString()).toBe('2026-10-24T04:30:00.000Z')
  })
})

describe('complaintOverdue', () => {
  test('open: on time up to the acknowledge-by moment itself', () => {
    expect(complaintOverdue({ status: 'open', receivedAt: created }, at(23))).toBeNull()
    expect(complaintOverdue({ status: 'open', receivedAt: created }, at(24))).toBeNull()
    expect(complaintOverdue({ status: 'open', receivedAt: created }, at(24.01))).toBe('acknowledge')
  })

  test('acknowledged: the 24 hours no longer apply, the 7 days do', () => {
    const c = { status: 'acknowledged' as const, receivedAt: created }
    expect(complaintOverdue(c, at(30))).toBeNull()
    expect(complaintOverdue(c, at(7 * 24))).toBeNull()
    expect(complaintOverdue(c, at(7 * 24 + 1))).toBe('resolve')
  })

  test('open past 7 days has missed both, and says the bigger one', () => {
    expect(complaintOverdue({ status: 'open', receivedAt: created }, at(8 * 24))).toBe('resolve')
  })

  test('resolved and closed are never overdue', () => {
    expect(isComplaintOverdue({ status: 'resolved', receivedAt: created }, at(30 * 24))).toBe(false)
    expect(isComplaintOverdue({ status: 'closed', receivedAt: created }, at(30 * 24))).toBe(false)
  })
})

describe('complaintClockLine', () => {
  test('says what is due next and how long is left', () => {
    expect(complaintClockLine({ status: 'open', receivedAt: created }, at(19))).toBe(
      'Acknowledge within 5 h'
    )
    expect(complaintClockLine({ status: 'acknowledged', receivedAt: created }, at(24))).toBe(
      'Resolve within 6 days'
    )
  })

  test('or how late it is', () => {
    expect(complaintClockLine({ status: 'open', receivedAt: created }, at(27))).toBe(
      'Acknowledge overdue by 3 h'
    )
    expect(complaintClockLine({ status: 'acknowledged', receivedAt: created }, at(9 * 24))).toBe(
      'Resolve overdue by 2 days'
    )
  })

  test('finished ones say so', () => {
    expect(complaintClockLine({ status: 'resolved', receivedAt: created }, at(9 * 24))).toBe('Resolved')
    expect(complaintClockLine({ status: 'closed', receivedAt: created }, at(1))).toBe('Closed')
  })
})

describe('complaintDuration', () => {
  test('minutes, hours up to two days, then days', () => {
    expect(complaintDuration(45 * 60_000)).toBe('45 min')
    expect(complaintDuration(5 * HOUR)).toBe('5 h')
    expect(complaintDuration(47 * HOUR)).toBe('47 h')
    expect(complaintDuration(50 * HOUR)).toBe('2 days')
    expect(complaintDuration(-5)).toBe('0 min')
  })
})

test('the confirmation names the number and the 24 hours', () => {
  expect(complaintReceivedLine('C-000123')).toBe(
    "Complaint C-000123 received — we'll get back to you within 24 hours."
  )
})

test('dates read in India time', () => {
  // 20:00 UTC on the 17th is past midnight on the 18th in Chennai.
  expect(formatComplaintDate('2026-10-17T20:00:00.000Z')).toBe('18 Oct 2026')
})
