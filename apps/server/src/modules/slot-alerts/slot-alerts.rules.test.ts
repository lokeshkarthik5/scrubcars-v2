import { beforeEach, describe, expect, test } from 'bun:test'
import { AppError } from '../../lib/errors.js'
import { MAX_ACTIVE_SLOT_ALERTS } from '../../lib/slot-alerts.js'
import type { BusyInterval } from '../../lib/slots.js'
import { slotAlertsWith, type AlertGarage, type AlertOpened, type AlertRow, type SlotAlertsStore } from './slot-alerts.rules.js'

// The rules over an in-memory store that answers as the SQL does: "waiting"
// is not notified and its day not over, one waiting alert per customer,
// garage and date, and a claim only takes a row still waiting.

const IST = (iso: string) => new Date(`${iso}+05:30`)
const id = (n: number) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

const USER = id(2701)
const OTHER_USER = id(2702)
const GARAGE = id(2710)
const SERVICE = id(2720)
const LONG_SERVICE = id(2721)
const DATE = '2026-10-24'
const NOW = IST('2026-10-23T18:00:00')
const at = (time: string) => IST(`${DATE}T${time}:00`)

const GARAGE_ROW: AlertGarage = {
  id: GARAGE,
  businessName: 'Slot Alert Spa',
  bookingsPausedAt: null,
  slotIntervalMins: 60,
  bays: 1,
  jobsPerDay: null,
  dropinEnabled: true,
  doorstepEnabled: true,
  pickup: 'no',
  pickupRadiusKm: null,
  pickupTermsAcceptedAt: null,
}

const SERVICES = [
  { id: SERVICE, durationMins: 60 },
  { id: LONG_SERVICE, durationMins: 120 },
]

function hourly(except: string[] = []): BusyInterval[] {
  return ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
    .filter((time) => !except.includes(time))
    .map((time) => ({ start: at(time), durationMins: 60 }))
}

let rows: AlertRow[]
let garage: AlertGarage | undefined
let busy: BusyInterval[]
let opened: AlertOpened[]
let nextId: number

function memoryStore(): SlotAlertsStore {
  const isWaiting = (row: AlertRow, now: Date) => row.notifiedAt === null && row.expiresAt > now
  return {
    async findUser(userId) {
      return { id: userId, status: 'active' }
    },
    async findGarage(vendorId) {
      return garage && garage.id === vendorId ? garage : undefined
    },
    async findServices(_vendorId, serviceIds) {
      return SERVICES.filter((service) => serviceIds.includes(service.id))
    },
    async readDay() {
      return { hours: { openTime: '09:00:00', closeTime: '18:00:00', isClosed: false }, isHoliday: false, busy }
    },
    async setUnderLimit({ alert, now, decide }) {
      const existing = rows.find(
        (row) => row.userId === alert.userId && row.vendorId === alert.vendorId && row.date === alert.date && row.notifiedAt === null
      )
      const activeCount = rows.filter((row) => row.userId === alert.userId && isWaiting(row, now)).length
      const refusal = decide({ activeCount, replacing: Boolean(existing) })
      if (refusal) return { refusal, row: null, replaced: false }
      if (existing) {
        Object.assign(existing, { ...alert, createdAt: now })
        return { refusal: null, row: existing, replaced: true }
      }
      const row: AlertRow = { ...alert, id: id(2750 + nextId++), createdAt: now, notifiedAt: null }
      rows.push(row)
      return { refusal: null, row, replaced: false }
    },
    async listWaiting(userId, now) {
      return rows.filter((row) => row.userId === userId && isWaiting(row, now)).map((row) => ({ ...row, vendorName: 'Slot Alert Spa' }))
    },
    async removeWaiting(userId, alertId) {
      const index = rows.findIndex((row) => row.id === alertId && row.userId === userId && row.notifiedAt === null)
      if (index < 0) return false
      rows.splice(index, 1)
      return true
    },
    async listWaitingForGarageDay(vendorId, date, now, limit) {
      return rows.filter((row) => row.vendorId === vendorId && row.date === date && isWaiting(row, now)).slice(0, limit)
    },
    async claim(alertId, _slotAt, now) {
      const row = rows.find((candidate) => candidate.id === alertId)
      if (!row || !isWaiting(row, now)) return false
      row.notifiedAt = now
      return true
    },
    async markChecked() {},
  }
}

const rules = () => slotAlertsWith({ store: memoryStore(), onOpened: (alert) => opened.push(alert) })

const ask = { vendorId: GARAGE, date: DATE, window: 'any' as const, bookingType: 'dropin' as const, serviceIds: [SERVICE] }

async function refusalOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (err) {
    if (err instanceof AppError) return err.code
    throw err
  }
  return undefined
}

beforeEach(() => {
  rows = []
  garage = { ...GARAGE_ROW }
  busy = hourly()
  opened = []
  nextId = 1
})

describe('setting an alert', () => {
  test('on a full day: stored for the session’s customer with the job’s length, until the day ends', async () => {
    const { alert, replaced } = await rules().create(USER, { ...ask, serviceIds: [SERVICE, LONG_SERVICE] }, NOW)
    expect(replaced).toBe(false)
    expect(alert).toMatchObject({ vendorId: GARAGE, date: DATE, window: 'any', bookingType: 'dropin', durationMins: 180 })
    expect(alert.expiresAt).toBe(IST('2026-10-25T00:00:00').toISOString())
    expect(rows[0].userId).toBe(USER)
  })

  test('one per garage and date: setting it again changes the window, and is not a second alert', async () => {
    await rules().create(USER, ask, NOW)
    const again = await rules().create(USER, { ...ask, window: 'morning' }, NOW)
    expect(again.replaced).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].window).toBe('morning')
  })

  test(`at most ${MAX_ACTIVE_SLOT_ALERTS} waiting; a sent or past one does not count`, async () => {
    const r = rules()
    for (let day = 24; day < 24 + MAX_ACTIVE_SLOT_ALERTS; day += 1) {
      rows.push({
        id: id(2770 + day - 24), userId: USER, vendorId: id(2799), date: `2026-10-${day}`, window: 'any',
        bookingType: 'dropin', durationMins: 60, serviceIds: [SERVICE], createdAt: NOW,
        expiresAt: IST(`2026-10-${day + 1}T00:00:00`), notifiedAt: null,
      })
    }
    expect(await refusalOf(r.create(USER, ask, NOW))).toBe('SLOT_ALERT_LIMIT')
    // Another customer has their own five.
    expect((await r.create(OTHER_USER, ask, NOW)).alert.vendorId).toBe(GARAGE)
    rows[0].notifiedAt = NOW
    expect((await r.create(USER, ask, NOW)).replaced).toBe(false)
  })

  test('not when a time in the window is free now: book it instead', async () => {
    busy = hourly(['14:00'])
    expect(await refusalOf(rules().create(USER, ask, NOW))).toBe('SLOT_ALERT_SLOT_FREE')
    expect((await rules().create(USER, { ...ask, window: 'morning' }, NOW)).alert.window).toBe('morning')
  })

  test('not for a day that has passed, one too far off, or a garage that cannot be booked that way', async () => {
    expect(await refusalOf(rules().create(USER, { ...ask, date: '2026-10-22' }, NOW))).toBe('SLOT_ALERT_DATE_PASSED')
    expect(await refusalOf(rules().create(USER, { ...ask, date: '2027-01-30' }, NOW))).toBe('SLOT_ALERT_TOO_FAR_AHEAD')
    expect(await refusalOf(rules().create(USER, { ...ask, bookingType: 'pickup' }, NOW))).toBe('BOOKING_TYPE_NOT_OFFERED')
    expect(await refusalOf(rules().create(USER, { ...ask, serviceIds: [SERVICE, id(2729)] }, NOW))).toBe('SERVICE_NOT_FOUND')
    garage = { ...GARAGE_ROW, bookingsPausedAt: NOW }
    expect(await refusalOf(rules().create(USER, ask, NOW))).toBe('GARAGE_PAUSED')
    garage = undefined
    expect(await refusalOf(rules().create(USER, ask, NOW))).toBe('VENDOR_NOT_FOUND')
    expect(rows).toHaveLength(0)
  })
})

describe('listing and cancelling', () => {
  test('a customer sees and cancels only their own waiting alerts', async () => {
    const mine = (await rules().create(USER, ask, NOW)).alert
    const theirs = (await rules().create(OTHER_USER, ask, NOW)).alert
    expect((await rules().list(USER, NOW)).items.map((item) => item.id)).toEqual([mine.id])
    expect(await refusalOf(rules().remove(USER, theirs.id))).toBe('SLOT_ALERT_NOT_FOUND')
    expect(rows).toHaveLength(2)
    expect(await rules().remove(USER, mine.id)).toEqual({ id: mine.id, removed: true })
    expect(rows.map((row) => row.id)).toEqual([theirs.id])
  })

  test('an alert whose day is over is no longer listed', async () => {
    await rules().create(USER, ask, NOW)
    expect((await rules().list(USER, IST('2026-10-25T00:00:01'))).items).toHaveLength(0)
  })
})

describe('re-checking after capacity was freed', () => {
  test('a cancellation in the window tells each matching alert once, with the earliest time', async () => {
    await rules().create(USER, ask, NOW)
    await rules().create(OTHER_USER, { ...ask, window: 'evening' }, NOW)
    busy = hourly(['10:00'])

    const summary = await rules().recheck(GARAGE, DATE, NOW)
    expect(summary).toEqual({ waiting: 2, opened: 1 })
    expect(opened).toHaveLength(1)
    expect(opened[0].alert.userId).toBe(USER)
    expect(opened[0].slotAt.toISOString()).toBe(at('10:00').toISOString())
    expect(opened[0].garageName).toBe('Slot Alert Spa')

    // Run again (the cron, or a second cancellation): nobody is told twice.
    busy = hourly(['10:00', '17:00'])
    await rules().recheck(GARAGE, DATE, NOW)
    expect(opened.map((item) => item.alert.userId)).toEqual([USER, OTHER_USER])
    await rules().recheck(GARAGE, DATE, NOW)
    expect(opened).toHaveLength(2)
  })

  test('first come: two alerts on one freed hour are both told; nothing is held', async () => {
    await rules().create(USER, ask, NOW)
    await rules().create(OTHER_USER, ask, NOW)
    busy = hourly(['12:00'])
    expect((await rules().recheck(GARAGE, DATE, NOW)).opened).toBe(2)
  })

  test('the job’s length and booking type: a one-hour gap is no use to a two-hour job or a doorstep visit too soon', async () => {
    await rules().create(USER, { ...ask, serviceIds: [LONG_SERVICE] }, NOW)
    await rules().create(OTHER_USER, { ...ask, bookingType: 'doorstep' }, NOW)
    busy = hourly(['09:00'])
    // 07:00 on the day: 09:00 is two hours off, short of a doorstep crew's three.
    expect((await rules().recheck(GARAGE, DATE, IST(`${DATE}T07:00:00`))).opened).toBe(0)
    busy = hourly(['09:00', '10:00'])
    expect((await rules().recheck(GARAGE, DATE, NOW)).opened).toBe(2)
  })

  test('an alert past its day, or at a garage customers can no longer open, is not told', async () => {
    await rules().create(USER, ask, NOW)
    busy = hourly(['12:00'])
    expect((await rules().recheck(GARAGE, DATE, IST('2026-10-25T00:00:00'))).opened).toBe(0)
    garage = undefined
    expect((await rules().recheck(GARAGE, DATE, NOW)).opened).toBe(0)
    garage = { ...GARAGE_ROW, dropinEnabled: false }
    expect((await rules().recheck(GARAGE, DATE, NOW)).opened).toBe(0)
    expect(opened).toHaveLength(0)
  })

  test('a dry run counts and claims nothing', async () => {
    await rules().create(USER, ask, NOW)
    busy = hourly(['12:00'])
    expect((await rules().recheck(GARAGE, DATE, NOW, { dryRun: true })).opened).toBe(1)
    expect(rows[0].notifiedAt).toBeNull()
    expect(opened).toHaveLength(0)
  })
})
