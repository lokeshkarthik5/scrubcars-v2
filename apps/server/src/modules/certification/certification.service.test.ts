/**
 * The nightly evaluation end to end over stand-in rows: who is due, what is
 * saved, and that a certified garage short for 14 days loses the badge with
 * an audit row, while one short for less keeps it. The rules themselves are
 * lib/certification.test.ts's.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { certificationRepository } = await import('./certification.repository.js')
const { certificationService } = await import('./certification.service.js')

const SHORT_GARAGE = 'e2e00000-0000-4000-8000-000000002830'
const NEW_GARAGE = 'e2e00000-0000-4000-8000-000000002831'
const NOW = new Date('2026-10-18T00:30:00Z') // 06:00 IST

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const ENV_KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2DocsBucket', 'r2Endpoint'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]))
function documentsOn(on: boolean) {
  const values = env as unknown as Record<string, string | undefined>
  values.r2AccountId = on ? 'test-account' : undefined
  values.r2AccessKeyId = on ? 'test-key' : undefined
  values.r2SecretAccessKey = on ? 'test-secret' : undefined
  values.r2DocsBucket = on ? 'detlio-docs-test' : undefined
  values.r2Endpoint = on ? 'http://localhost:9000' : undefined
}

let states: Map<string, Record<string, unknown>>
let saved: Array<{ vendorId: string; eligible: boolean; ineligibleSince: Date | null }>
let revoked: Array<{ vendorId: string; revokeKind: string; revokedBy: string }>
let audits: string[]
let dueAsked: Date[]

beforeAll(() => {
  patch(certificationRepository, 'listDueForEvaluation', async (runStart: Date) => {
    dueAsked.push(runStart)
    return [
      { id: SHORT_GARAGE, businessName: 'Slipping Garage' },
      { id: NEW_GARAGE, businessName: 'Rising Garage' },
    ]
  })
  patch(certificationRepository, 'listApprovedDocumentTypes', async (ids: string[]) =>
    ids.flatMap((vendorId) =>
      ['shop_photo', 'owner_id', 'bank_proof', 'agreement'].map((type) => ({ vendorId, type, status: 'approved' }))
    )
  )
  // The slipping garage's rating fell below 4.5; the rising one's is fine.
  patch(certificationRepository, 'ratings', async (ids: string[]) =>
    ids.map((vendorId) => ({ vendorId, average: vendorId === SHORT_GARAGE ? 4.1 : 4.8, count: 15 }))
  )
  patch(certificationRepository, 'completedCounts', async (ids: string[]) => ids.map((vendorId) => ({ vendorId, count: 30 })))
  patch(certificationRepository, 'responseCounts', async () => [])
  patch(certificationRepository, 'complaintCounts', async () => [])
  patch(certificationRepository, 'garageNoShowCounts', async () => [])
  patch(certificationRepository, 'listRecentChecks', async (ids: string[]) =>
    ids.map((vendorId) => ({ vendorId, checkedOn: '2026-09-01', result: 'pass', createdAt: new Date('2026-09-01') }))
  )
  patch(certificationRepository, 'transaction', async (vendorId: string, work: (repo: unknown) => Promise<unknown>) =>
    work({
      findState: async (id: string) => states.get(id),
      saveEvaluation: async (id: string, values: { eligible: boolean; ineligibleSince: Date | null }) => {
        saved.push({ vendorId: id, eligible: values.eligible, ineligibleSince: values.ineligibleSince })
      },
      revoke: async (id: string, values: { revokeKind: string; revokedBy: string }) => {
        revoked.push({ vendorId: id, ...values })
        return { vendorId }
      },
      insertAudit: async (entry: { action: string }) => {
        audits.push(entry.action)
      },
    })
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
})

beforeEach(() => {
  documentsOn(true)
  states = new Map()
  saved = []
  revoked = []
  audits = []
  dueAsked = []
})

const certified = (ineligibleSince: Date | null) => ({
  certifiedAt: new Date('2026-06-01T00:00:00Z'),
  revokedAt: null,
  ineligibleSince,
  eligible: true,
  lastEvaluatedAt: new Date('2026-10-17T00:30:00Z'),
  eligibleAlertedAt: null,
})

describe('certificationService.sweep', () => {
  test('nothing at all while garage documents are off', async () => {
    documentsOn(false)
    expect(await certificationService.sweep({ dryRun: false, now: NOW })).toEqual({ enabled: false })
    expect(dueAsked).toHaveLength(0)
  })

  test("asks for the garages not evaluated since today's 05:00 IST", async () => {
    await certificationService.sweep({ dryRun: true, now: NOW })
    expect(dueAsked[0]!.toISOString()).toBe('2026-10-17T23:30:00.000Z')
    expect(saved).toHaveLength(0)
  })

  test('a certified garage short for the first night starts its 14 days and keeps the badge', async () => {
    states.set(SHORT_GARAGE, certified(null))
    const summary = await certificationService.sweep({ dryRun: false, now: NOW })
    expect(summary).toMatchObject({ evaluated: 2, eligible: 1, atRisk: 1, lapsed: 0 })
    expect(saved.find((row) => row.vendorId === SHORT_GARAGE)).toEqual({
      vendorId: SHORT_GARAGE,
      eligible: false,
      ineligibleSince: NOW,
    })
    expect(revoked).toHaveLength(0)
  })

  test('short for 13 days keeps it; on the 14th it lapses, automatically, with an audit row', async () => {
    states.set(SHORT_GARAGE, certified(new Date('2026-10-05T00:30:00Z')))
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(revoked).toHaveLength(0)

    saved = []
    states.set(SHORT_GARAGE, certified(new Date('2026-10-04T00:30:00Z')))
    const summary = await certificationService.sweep({ dryRun: false, now: NOW })
    expect(summary).toMatchObject({ lapsed: 1 })
    expect(revoked).toEqual([
      expect.objectContaining({ vendorId: SHORT_GARAGE, revokeKind: 'lapsed', revokedBy: 'Detlio (automatic)' }),
    ])
    expect(audits).toEqual(['garage_certification_lapsed'])
    // The 14 days end with the badge, so they are not saved as still running.
    expect(saved.find((row) => row.vendorId === SHORT_GARAGE)?.ineligibleSince).toBeNull()
  })

  test('a garage that is not certified is saved as eligible and never revoked', async () => {
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(saved.find((row) => row.vendorId === NEW_GARAGE)).toEqual({
      vendorId: NEW_GARAGE,
      eligible: true,
      ineligibleSince: null,
    })
    expect(revoked).toHaveLength(0)
  })
})
