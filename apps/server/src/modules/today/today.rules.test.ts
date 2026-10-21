import { describe, expect, test } from 'bun:test'
import {
  bookingsToday,
  excerpt,
  garageFigures,
  garageTasks,
  isBlocked,
  istDate,
  sortTasks,
  taskCounts,
  type GarageRow,
  type TodayTask,
} from './today.rules.js'

const base = { late: false, since: null, dueAt: null } as const

function refund(id: string, since: string): TodayTask {
  return {
    ...base,
    key: `refund_owed:${id}`,
    kind: 'refund_owed',
    group: 'money',
    since,
    refundId: id,
    bookingId: null,
    reference: id,
    customerName: 'A',
    garageName: 'G',
    amountOwed: '549.00',
    razorpayPaymentId: null,
  }
}

function complaint(id: string, dueAt: string, late = false): TodayTask {
  return {
    ...base,
    key: `complaint:${id}`,
    kind: 'complaint',
    group: 'issues',
    dueAt,
    late,
    complaintId: id,
    number: id,
    message: 'm',
    customerName: 'C',
    garageName: null,
    stage: 'acknowledge',
  }
}

function garage(overrides: Partial<GarageRow>): GarageRow {
  return {
    id: 'g',
    businessName: 'Garage',
    status: 'active',
    live: false,
    bookingsPausedAt: null,
    deletedAt: null,
    documents: null,
    readiness: [],
    ...overrides,
  }
}

describe('the Today inbox', () => {
  test('tasks with a deadline come first, soonest (so the late ones) on top; then the oldest waiting', () => {
    const sorted = sortTasks([
      refund('r-new', '2026-10-19T08:00:00Z'),
      {
        ...garageTasks([
          garage({
            id: 'b',
            readiness: [{ severity: 'blocking', short: 'map pin' }],
          }),
        ])[0]!,
      },
      complaint('c-later', '2026-10-19T12:00:00Z'),
      refund('r-old', '2026-10-17T08:00:00Z'),
      complaint('c-late', '2026-10-18T06:00:00Z', true),
    ])
    expect(sorted.map((task) => task.key)).toEqual([
      'complaint:c-late',
      'complaint:c-later',
      'refund_owed:r-old',
      'refund_owed:r-new',
      'garage_blocked:b',
    ])
  })

  test('the menu counts each place, and how many of them are late', () => {
    const counts = taskCounts([
      complaint('a', '2026-10-18T06:00:00Z', true),
      complaint('b', '2026-10-19T06:00:00Z'),
      refund('r', '2026-10-17T08:00:00Z'),
    ])
    expect(counts.today).toEqual({ n: 3, late: 1 })
    expect(counts.issues).toEqual({ n: 2, late: 1 })
    expect(counts.refunds).toEqual({ n: 1, late: 0 })
    expect(counts.bookings).toEqual({ n: 0, late: 0 })
    expect(counts.garages).toEqual({ n: 0, late: 0 })
  })

  test('blocked means on its way in with something blocking; paused, archived and binned are not tasks', () => {
    const blocking = [{ severity: 'blocking' as const, short: 'services' }]
    expect(isBlocked(garage({ status: 'pending', readiness: blocking }))).toBe(
      true
    )
    expect(isBlocked(garage({ readiness: blocking }))).toBe(true)
    expect(
      isBlocked(garage({ readiness: [{ severity: 'fix', short: 'logo' }] }))
    ).toBe(false)
    expect(
      isBlocked(garage({ readiness: blocking, bookingsPausedAt: new Date() }))
    ).toBe(false)
    expect(isBlocked(garage({ status: 'archived', readiness: blocking }))).toBe(
      false
    )
    expect(
      isBlocked(garage({ deletedAt: new Date(), readiness: blocking }))
    ).toBe(false)
    expect(isBlocked(garage({ live: true, readiness: blocking }))).toBe(false)
  })

  test("the garages' figures leave the Bin out, as the list's All does", () => {
    const figures = garageFigures([
      garage({ id: '1', live: true }),
      garage({ id: '2', bookingsPausedAt: '2026-10-18T00:00:00Z' }),
      garage({
        id: '3',
        documents: { toReview: 2 },
        readiness: [{ severity: 'blocking', short: 'map pin' }],
      }),
      garage({
        id: '4',
        deletedAt: '2026-10-01T00:00:00Z',
        documents: { toReview: 1 },
      }),
    ])
    expect(figures).toEqual({
      live: 1,
      total: 3,
      blocked: 1,
      paused: 1,
      documentsToReview: 1,
    })
    const tasks = garageTasks([garage({ id: '3', documents: { toReview: 2 } })])
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ kind: 'documents', toReview: 2 })
  })

  test("today's bookings: cancelled ones are not counted", () => {
    expect(
      bookingsToday([
        { status: 'completed' },
        { status: 'pending' },
        { status: 'confirmed' },
        { status: 'in_progress' },
        { status: 'cancelled' },
      ])
    ).toEqual({ total: 4, done: 1, toCome: 2, waiting: 1 })
  })

  test('the day is the Chennai day, and a long message is cut to one line', () => {
    // 20:00 UTC on the 18th is 01:30 on the 19th in Chennai.
    expect(istDate(new Date('2026-10-18T20:00:00Z'))).toBe('2026-10-19')
    expect(excerpt('Scratch\non the  bumper')).toBe('Scratch on the bumper')
    expect(excerpt('x'.repeat(200))).toHaveLength(120)
  })
})
