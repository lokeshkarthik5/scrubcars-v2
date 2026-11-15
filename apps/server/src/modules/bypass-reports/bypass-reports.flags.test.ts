/**
 * Detlio's own checks (0075, lib/off-app-flags.ts) as the cron and Check now
 * run them, with only the database stood in for (the repository's methods
 * replaced on its object, put back after):
 *
 * - nothing at all while OFF_APP_FLAGS_ENABLED is off;
 * - a phone number in a garage's note makes one flag, its evidence masked,
 *   and a second run makes none (the evidence key);
 * - softer wording is left alone with AI off, and AI's "no" leaves it too;
 * - the three checks each write their own flag, never with a reporter.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { bypassReportsRepository } = await import('./bypass-reports.repository.js')
const { bypassReportsService } = await import('./bypass-reports.service.js')

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}
const setEnv = (key: string, value: unknown) => ((env as unknown as Record<string, unknown>)[key] = value)
const saved = { flags: env.offAppFlagsEnabled, key: env.openaiApiKey, fake: env.aiFake }

const NOW = new Date('2026-11-15T07:00:00+05:30')
const DAY = 24 * 60 * 60 * 1000
const GARAGE = 'garage-1'

type Note = { noteId: string; where: string; text: string }
let notes: Note[] = []
let chains: unknown[] = []
let cancels: unknown[] = []
const flags = new Map<string, Record<string, unknown>>()

beforeAll(() => {
  patch(bypassReportsRepository, 'garageNotesSince', async () =>
    notes.map((n) => ({
      ...n,
      writtenAt: new Date(NOW.getTime() - DAY),
      bookingId: 'booking-aaaaaaaa',
      rootBookingId: 'booking-aaaaaaaa',
      vendorId: GARAGE,
      garageName: 'Lakshmi Car Wash',
    }))
  )
  patch(bypassReportsRepository, 'flagExists', async (key: string) => flags.has(key))
  patch(bypassReportsRepository, 'insertFlag', async (values: Record<string, unknown>) => {
    const key = values.evidenceKey as string
    if (flags.has(key)) return null
    flags.set(key, values)
    return { id: key }
  })
  patch(bypassReportsRepository, 'dropOffChains', async () => chains)
  patch(bypassReportsRepository, 'inspectionCancelsSince', async () => cancels)
  patch(bypassReportsRepository, 'garageNames', async (ids: string[]) =>
    ids.map((id) => ({ id, name: 'Lakshmi Car Wash', deletedAt: null }))
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  setEnv('offAppFlagsEnabled', saved.flags)
  setEnv('openaiApiKey', saved.key)
  setEnv('aiFake', saved.fake)
})

beforeEach(() => {
  notes = []
  chains = []
  cancels = []
  flags.clear()
  setEnv('offAppFlagsEnabled', true)
  setEnv('openaiApiKey', undefined)
  setEnv('aiFake', false)
})

describe('runFlagChecks', () => {
  test('off: nothing is read or written', async () => {
    setEnv('offAppFlagsEnabled', false)
    notes = [{ noteId: 'n1', where: 'bill_note', text: 'call 9840014210' }]
    expect(await bypassReportsService.runFlagChecks({ dryRun: false }, NOW)).toEqual({ enabled: false })
    expect(flags.size).toBe(0)
  })

  test('a number in a note: one flag, masked, and none the second time', async () => {
    notes = [{ noteId: 'n1', where: 'bill_note', text: 'Sir next time call 98400 14210 directly' }]
    const first = await bypassReportsService.runFlagChecks({ dryRun: false }, NOW)
    expect(first).toMatchObject({ enabled: true, created: 1 })
    const [written] = [...flags.values()]
    expect(written).toMatchObject({
      signal: 'contact_in_note',
      kind: 'gave_number',
      vendorId: GARAGE,
      evidence: { excerpt: 'Sir next time call 98•••• •4210 directly', found: ['phone'], confirmedByAi: false },
    })
    expect(JSON.stringify(written)).not.toContain('14210 ')
    expect(JSON.stringify(written)).not.toContain('9840014210')

    const second = await bypassReportsService.runFlagChecks({ dryRun: false }, NOW)
    expect(second).toMatchObject({ created: 0 })
    expect(flags.size).toBe(1)
  })

  test('softer wording: left alone with AI off, and when AI says no', async () => {
    notes = [{ noteId: 'n2', where: 'time_suggestion', text: 'GPay also fine sir' }]
    expect(await bypassReportsService.runFlagChecks({ dryRun: false }, NOW)).toMatchObject({ created: 0, aiAsked: 0 })
    // The fake client answers with a fixed sentence, never "yes".
    setEnv('aiFake', true)
    expect(await bypassReportsService.runFlagChecks({ dryRun: false }, NOW)).toMatchObject({ created: 0, aiAsked: 1 })
    expect(flags.size).toBe(0)
  })

  test('regulars who stopped, and repeated cancellations after inspection', async () => {
    const regular = (userId: string, lastDaysAgo: number) => [
      { userId, vendorId: GARAGE, bookingId: `${userId}-1`, status: 'completed', bookedAt: new Date(NOW.getTime() - (lastDaysAgo + 31) * DAY), serviceAt: new Date(NOW.getTime() - (lastDaysAgo + 30) * DAY) },
      { userId, vendorId: GARAGE, bookingId: `${userId}-2`, status: 'completed', bookedAt: new Date(NOW.getTime() - (lastDaysAgo + 1) * DAY), serviceAt: new Date(NOW.getTime() - lastDaysAgo * DAY) },
    ]
    chains = [...['a', 'b', 'c', 'd', 'e'].flatMap((u) => regular(u, 45)), ...['f', 'g'].flatMap((u) => regular(u, 3))]
    cancels = [20, 12, 2].map((days, i) => ({
      bookingId: `cancel-${i}`,
      userId: 'customer-1',
      vendorId: GARAGE,
      cancelledAt: new Date(NOW.getTime() - days * DAY),
      reason: 'Price too high, call 9840014210',
    }))
    const summary = await bypassReportsService.runFlagChecks({ dryRun: false }, NOW)
    expect(summary).toMatchObject({ created: 2, regulars: 1, inspection: 1, failed: 0 })
    const bySignal = Object.fromEntries([...flags.values()].map((f) => [f.signal as string, f]))
    expect(bySignal.regulars_went_quiet).toMatchObject({
      bookingId: null,
      bookingRef: null,
      evidence: { regulars: 7, stopped: 5, stoppedDays: 30 },
    })
    expect(bySignal.cancelled_after_inspection).toMatchObject({
      bookingId: 'cancel-2',
      evidence: { userId: 'customer-1', days: 18 },
    })
    expect(JSON.stringify(bySignal.cancelled_after_inspection)).not.toContain('9840014210')
  })

  test('a dry run counts and writes nothing', async () => {
    notes = [{ noteId: 'n1', where: 'bill_note', text: 'pay directly please' }]
    expect(await bypassReportsService.runFlagChecks({ dryRun: true }, NOW)).toMatchObject({ created: 1 })
    expect(flags.size).toBe(0)
  })
})
