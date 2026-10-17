import { describe, expect, test } from 'bun:test'
import {
  MAX_COMPLAINTS_PER_HOUR,
  MAX_UNFINISHED_COMPLAINTS,
  canTakeComplaintAction,
  complaintDueTimes,
  complaintOverdue,
  complaintSubmitRefusal,
  formatComplaintNumber,
  overdueCutoffs,
  type ComplaintStatus,
} from './complaints.js'

const HOUR = 60 * 60 * 1000
const created = new Date('2026-10-17T04:30:00.000Z')
const at = (hours: number) => new Date(created.getTime() + hours * HOUR)

describe('formatComplaintNumber', () => {
  test('C- and six digits', () => {
    expect(formatComplaintNumber(1)).toBe('C-000001')
    expect(formatComplaintNumber(123)).toBe('C-000123')
    expect(formatComplaintNumber(1000000)).toBe('C-1000000')
  })
})

describe('due times', () => {
  test('acknowledge by 24 hours after, resolve by 7 days after', () => {
    const due = complaintDueTimes(created)
    expect(due.acknowledgeBy.getTime() - created.getTime()).toBe(24 * HOUR)
    expect(due.resolveBy.getTime() - created.getTime()).toBe(7 * 24 * HOUR)
  })
})

describe('complaintOverdue', () => {
  const cases: Array<[ComplaintStatus, number, 'acknowledge' | 'resolve' | null]> = [
    ['open', 1, null],
    ['open', 24, null],
    ['open', 25, 'acknowledge'],
    ['open', 7 * 24 + 1, 'resolve'],
    ['acknowledged', 25, null],
    ['acknowledged', 7 * 24, null],
    ['acknowledged', 7 * 24 + 1, 'resolve'],
    ['resolved', 30 * 24, null],
    ['closed', 30 * 24, null],
  ]
  for (const [status, hours, expected] of cases) {
    test(`${status} after ${hours} h is ${expected ?? 'on time'}`, () => {
      expect(complaintOverdue({ status, createdAt: created }, at(hours))).toBe(expected)
    })
  }
})

describe('overdueCutoffs', () => {
  // The SQL's rule must say the same as complaintOverdue for every row.
  const sqlRule = (status: ComplaintStatus, createdAt: Date, now: Date) => {
    const cut = overdueCutoffs(now)
    return (
      (status === 'open' && createdAt < cut.openMadeBefore) ||
      ((status === 'open' || status === 'acknowledged') && createdAt < cut.unfinishedMadeBefore)
    )
  }

  test('agrees with complaintOverdue, either side of each due moment', () => {
    const statuses: ComplaintStatus[] = ['open', 'acknowledged', 'resolved', 'closed']
    for (const status of statuses) {
      for (const hours of [0, 23.9, 24, 24.1, 100, 167.9, 168, 168.1, 400]) {
        const now = at(hours)
        expect(sqlRule(status, created, now)).toBe(
          complaintOverdue({ status, createdAt: created }, now) !== null
        )
      }
    }
  })
})

describe('complaintSubmitRefusal', () => {
  test('lets a customer with room through', () => {
    expect(complaintSubmitRefusal({ unfinished: 0, lastHour: 0 })).toBeNull()
    expect(
      complaintSubmitRefusal({ unfinished: MAX_UNFINISHED_COMPLAINTS - 1, lastHour: MAX_COMPLAINTS_PER_HOUR - 1 })
    ).toBeNull()
  })

  test('stops at five waiting, then at three an hour', () => {
    expect(complaintSubmitRefusal({ unfinished: 5, lastHour: 0 })).toBe('too_many_open')
    expect(complaintSubmitRefusal({ unfinished: 1, lastHour: 3 })).toBe('too_many_recent')
    expect(complaintSubmitRefusal({ unfinished: 5, lastHour: 3 })).toBe('too_many_open')
  })
})

describe('canTakeComplaintAction', () => {
  test('acknowledge only an open one', () => {
    expect(canTakeComplaintAction('open', 'acknowledge')).toBe(true)
    expect(canTakeComplaintAction('acknowledged', 'acknowledge')).toBe(false)
    expect(canTakeComplaintAction('resolved', 'acknowledge')).toBe(false)
  })

  test('resolve from open or acknowledged, never again', () => {
    expect(canTakeComplaintAction('open', 'resolve')).toBe(true)
    expect(canTakeComplaintAction('acknowledged', 'resolve')).toBe(true)
    expect(canTakeComplaintAction('resolved', 'resolve')).toBe(false)
    expect(canTakeComplaintAction('closed', 'resolve')).toBe(false)
  })

  test('close anything not closed', () => {
    expect(canTakeComplaintAction('open', 'close')).toBe(true)
    expect(canTakeComplaintAction('resolved', 'close')).toBe(true)
    expect(canTakeComplaintAction('closed', 'close')).toBe(false)
  })
})
