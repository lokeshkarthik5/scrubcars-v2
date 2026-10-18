/**
 * The cron's part and the completion hook, over a stand-in repository and
 * push sender: a completion writes its follow-ups once; the due date's
 * notification goes once per date (claimed), only in the 09:00 IST runs,
 * never for a reminder already booked, and not at all while notifications
 * are off.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { pushService } = await import('../push/push.service.js')
const { carHistoryRepository } = await import('./car-history.repository.js')
const { carHistoryService } = await import('./car-history.service.js')

const IST = (iso: string) => new Date(`${iso}+05:30`)

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}
const envValues = env as unknown as Record<string, unknown>
const savedEnv = { vapidPublicKey: envValues.vapidPublicKey, pushFake: envValues.pushFake }

const sent: Array<{ userId: string; title: string; url: string }> = []
let notifiedOn: string | null = null
let carBookings: Array<Record<string, unknown>> = []
const written: Array<{ insert: unknown[]; done: string[]; superseded: string[] }> = []

const reminder = {
  id: 'r-1',
  userId: 'u-1',
  vehicleId: 'car-1',
  kind: 'maintenance_wash' as const,
  dueOn: '2026-04-15',
  snoozedUntil: null,
  get notifiedOn() {
    return notifiedOn
  },
  sourceBookingId: 'coat-1',
  vendorName: 'Shine Studio',
  vehicleName: 'Honda City',
  createdAt: IST('2026-01-15T16:00:00'),
}

beforeAll(() => {
  patch(carHistoryRepository, 'listUnscheduledCompletions', async () => [])
  patch(carHistoryRepository, 'listPushCandidates', async () => (notifiedOn === '2026-04-15' ? [] : [reminder]))
  patch(carHistoryRepository, 'listCarBookings', async () => carBookings)
  patch(carHistoryRepository, 'claimNotified', async (_id: string, today: string) => {
    if (notifiedOn === today) return false
    notifiedOn = today
    return true
  })
  patch(carHistoryRepository, 'findFinishedJob', async (bookingId: string) => ({
    id: bookingId,
    userId: 'u-1',
    vehicleId: 'car-1',
    status: bookingId === 'not-done' ? 'in_progress' : 'completed',
    completedAt: IST('2026-01-15T16:00:00'),
    scheduledAt: IST('2026-01-15T10:00:00'),
    categories: ['coating'],
  }))
  patch(carHistoryRepository, 'listOpenRemindersOfCar', async () => [])
  patch(carHistoryRepository, 'applyCompletion', async (input: { insert: unknown[]; done: string[]; superseded: string[] }) => {
    written.push({ insert: input.insert, done: input.done, superseded: input.superseded })
    return { inserted: input.insert.length, done: input.done.length, superseded: input.superseded.length }
  })
  patch(pushService, 'sendNow', async (recipient: { userId: string }, message: { title: string; url: string }) => {
    sent.push({ userId: recipient.userId, title: message.title, url: message.url })
    return { devices: 1, sent: 1, removed: 0, failed: 0, failures: [] }
  })
  envValues.vapidPublicKey = 'BCeIsUjive6tFPj-LNJcxv3KY2xvAd4G-L9e11RsQB2JtCkzsBq0FJwgjY1Soi9ODPhBNE3iUctLH7c2v-uHZO4'
  envValues.pushFake = true
})

beforeEach(() => {
  sent.length = 0
  written.length = 0
  notifiedOn = null
  carBookings = []
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(envValues, savedEnv)
})

describe('the due date’s notification', () => {
  test('sent once in the 09:00 IST runs of the due date: a second run finds it claimed', async () => {
    const first = await carHistoryService.sweep({ dryRun: false }, IST('2026-04-15T09:00:00'))
    expect(first).toMatchObject({ sent: 1, failed: 0 })
    expect(sent).toEqual([{ userId: 'u-1', title: 'Maintenance wash for your coating', url: '/profile/cars/car-1' }])
    const second = await carHistoryService.sweep({ dryRun: false }, IST('2026-04-15T09:10:00'))
    expect(second).toMatchObject({ sent: 0 })
    expect(sent).toHaveLength(1)
  })

  test('not outside the 09:00 runs, and a dry run only counts', async () => {
    expect(await carHistoryService.sweep({ dryRun: false }, IST('2026-04-15T10:00:00'))).toMatchObject({ sent: 0 })
    expect(await carHistoryService.sweep({ dryRun: true }, IST('2026-04-15T09:00:00'))).toMatchObject({ sent: 1 })
    expect(sent).toEqual([])
    expect(notifiedOn).toBeNull()
  })

  test('not once a paid booking answers it', async () => {
    carBookings = [{
      id: 'wash', vehicleId: 'car-1', status: 'confirmed', scheduledAt: IST('2026-04-16T10:00:00'),
      completedAt: null, paid: true, categories: ['car_wash'],
    }]
    expect(await carHistoryService.sweep({ dryRun: false }, IST('2026-04-15T09:00:00'))).toMatchObject({ sent: 0, skipped: 1 })
    expect(sent).toEqual([])
  })

  test('nothing while notifications are off', async () => {
    envValues.pushFake = false
    const saved = envValues.vapidPublicKey
    envValues.vapidPublicKey = undefined
    try {
      expect(await carHistoryService.sweep({ dryRun: false }, IST('2026-04-15T09:00:00'))).toEqual({
        scheduled: 0, sent: 0, skipped: 0, failed: 0,
      })
    } finally {
      envValues.vapidPublicKey = saved
      envValues.pushFake = true
    }
  })
})

describe('a completion', () => {
  test('a coating writes its maintenance wash and check', async () => {
    await carHistoryService.onBookingCompleted('coat-1')
    expect(written).toEqual([{
      insert: [
        { kind: 'maintenance_wash', dueOn: '2026-04-15' },
        { kind: 'coating_check', dueOn: '2027-01-15' },
      ],
      done: [],
      superseded: [],
    }])
  })

  test('a booking not completed writes nothing', async () => {
    expect(await carHistoryService.onBookingCompleted('not-done')).toBeNull()
    expect(written).toEqual([])
  })
})
