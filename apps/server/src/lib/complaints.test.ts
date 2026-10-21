import { describe, expect, test } from 'bun:test'
import {
  COMPLAINT_SOURCES,
  LOGGED_COMPLAINT_SOURCES,
  MAX_COMPLAINTS_PER_HOUR,
  MAX_UNFINISHED_COMPLAINTS,
  canTakeComplaintAction,
  complaintDueTimes,
  complaintOverdue,
  complaintSubmitRefusal,
  formatComplaintNumber,
  overdueCutoffs,
  resolveReceivedAt,
  type ComplaintStatus,
} from './complaints.js'

const HOUR = 60 * 60 * 1000
const received = new Date('2026-10-17T04:30:00.000Z')
const at = (hours: number) => new Date(received.getTime() + hours * HOUR)

describe('formatComplaintNumber', () => {
  test('C- and six digits', () => {
    expect(formatComplaintNumber(1)).toBe('C-000001')
    expect(formatComplaintNumber(123)).toBe('C-000123')
    expect(formatComplaintNumber(1000000)).toBe('C-1000000')
  })
})

describe('due times', () => {
  test('acknowledge by 24 hours after it was received, resolve by 7 days after', () => {
    const due = complaintDueTimes(received)
    expect(due.acknowledgeBy.getTime() - received.getTime()).toBe(24 * HOUR)
    expect(due.resolveBy.getTime() - received.getTime()).toBe(7 * 24 * HOUR)
  })

  test('a complaint logged a day late is already due: the clock runs from when it was received', () => {
    // A WhatsApp message from Saturday night, logged on Monday morning.
    const loggedAt = at(30)
    expect(complaintOverdue({ status: 'open', receivedAt: received }, loggedAt)).toBe('acknowledge')
    expect(complaintOverdue({ status: 'open', receivedAt: loggedAt }, loggedAt)).toBeNull()
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
      expect(complaintOverdue({ status, receivedAt: received }, at(hours))).toBe(expected)
    })
  }
})

describe('overdueCutoffs', () => {
  // The SQL's rule must say the same as complaintOverdue for every row.
  const sqlRule = (status: ComplaintStatus, receivedAt: Date, now: Date) => {
    const cut = overdueCutoffs(now)
    return (
      (status === 'open' && receivedAt < cut.openReceivedBefore) ||
      ((status === 'open' || status === 'acknowledged') && receivedAt < cut.unfinishedReceivedBefore)
    )
  }

  test('agrees with complaintOverdue, either side of each due moment', () => {
    const statuses: ComplaintStatus[] = ['open', 'acknowledged', 'resolved', 'closed']
    for (const status of statuses) {
      for (const hours of [0, 23.9, 24, 24.1, 100, 167.9, 168, 168.1, 400]) {
        const now = at(hours)
        expect(sqlRule(status, received, now)).toBe(
          complaintOverdue({ status, receivedAt: received }, now) !== null
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

describe('resolveReceivedAt', () => {
  const now = new Date('2026-10-20T06:00:00.000Z')
  const minutes = (n: number) => new Date(now.getTime() + n * 60 * 1000)

  test('now when the team leaves it out', () => {
    expect(resolveReceivedAt(undefined, now)).toEqual({ at: now })
    expect(resolveReceivedAt(null, now)).toEqual({ at: now })
  })

  test('as typed, anywhere in the last 7 days', () => {
    expect(resolveReceivedAt(minutes(-90), now)).toEqual({ at: minutes(-90) })
    const weekAgo = minutes(-7 * 24 * 60)
    expect(resolveReceivedAt(weekAgo, now)).toEqual({ at: weekAgo })
  })

  test('refused further back than 7 days', () => {
    expect(resolveReceivedAt(minutes(-7 * 24 * 60 - 1), now)).toEqual({ refusal: 'too_old' })
  })

  test('a fast clock a few minutes ahead is taken as now; the future beyond that is refused', () => {
    expect(resolveReceivedAt(minutes(3), now)).toEqual({ at: now })
    expect(resolveReceivedAt(minutes(5), now)).toEqual({ at: now })
    expect(resolveReceivedAt(minutes(6), now)).toEqual({ refusal: 'in_future' })
  })
})

describe('sources', () => {
  test('the team logs anything but the app itself', () => {
    expect([...LOGGED_COMPLAINT_SOURCES]).toEqual(COMPLAINT_SOURCES.filter((s) => s !== 'app'))
  })
})
