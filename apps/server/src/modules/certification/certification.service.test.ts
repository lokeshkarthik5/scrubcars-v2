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
const { agreementsRepository } = await import('../agreements/agreements.repository.js')
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
let saved: Array<{
  vendorId: string
  eligible: boolean
  ineligibleSince: Date | null
  eligibility?: { rules: Array<{ key: string; met: boolean; value: string }> }
}>
let revoked: Array<{ vendorId: string; revokeKind: string; revokedBy: string }>
let audits: string[]
let dueAsked: Date[]
/** Completed jobs with the garage's photo counts (0045), per garage. */
let photoJobs: Map<string, Array<{ garageBefore: number; garageAfter: number; waived?: boolean }>>
let photosAsked: Array<{ vendorIds: string[]; since: Date }>
/** The garage agreement (0063): the latest version, and who accepted it. */
let agreementLatest: { id: string; version: number; publishedAt: Date } | undefined
let accepted: Map<string, number>
/** Silver (0063): what is stored per garage, and what each night saved. */
let tierStates: Map<string, { silverAt: Date | null; silverShortSince: Date | null }>
let tierSaved: Array<{ vendorId: string; silverAt: Date | null; silverShortSince: Date | null; silverEligible: boolean }>

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
      ['shop_photo', 'owner_id', 'bank_proof'].map((type) => ({ vendorId, type, status: 'approved' }))
    )
  )
  patch(agreementsRepository, 'latest', async () => agreementLatest)
  patch(agreementsRepository, 'acceptedVersions', async (ids: string[]) =>
    new Map(ids.filter((id) => accepted.has(id)).map((id) => [id, accepted.get(id)!]))
  )
  // The slipping garage's rating fell below 4.5; the rising one's is fine.
  patch(certificationRepository, 'ratings', async (ids: string[]) =>
    ids.map((vendorId) => ({ vendorId, average: vendorId === SHORT_GARAGE ? 4.1 : 4.8, count: 15 }))
  )
  patch(certificationRepository, 'completedCounts', async (ids: string[]) => ids.map((vendorId) => ({ vendorId, count: 30 })))
  patch(certificationRepository, 'responseCounts', async () => [])
  patch(certificationRepository, 'complaintCounts', async () => [])
  patch(certificationRepository, 'garageNoShowCounts', async () => [])
  patch(certificationRepository, 'bypassStrikeCounts', async () => [])
  patch(certificationRepository, 'photoComplianceJobs', async (ids: string[], since: Date) => {
    photosAsked.push({ vendorIds: ids, since })
    return ids.flatMap((vendorId) =>
      (photoJobs.get(vendorId) ?? []).map((job) => ({
        vendorId,
        finishedAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
        garageBefore: job.garageBefore,
        garageAfter: job.garageAfter,
        waived: job.waived ?? false,
        markedTest: false,
      }))
    )
  })
  patch(certificationRepository, 'listRecentChecks', async (ids: string[]) =>
    ids.map((vendorId) => ({ vendorId, checkedOn: '2026-09-01', result: 'pass', createdAt: new Date('2026-09-01') }))
  )
  patch(certificationRepository, 'transaction', async (vendorId: string, work: (repo: unknown) => Promise<unknown>) =>
    work({
      findState: async (id: string) => states.get(id),
      findTierStanding: async (id: string) => tierStates.get(id),
      saveTierStanding: async (
        id: string,
        values: { silverAt: Date | null; silverShortSince: Date | null; silverEligible: boolean }
      ) => {
        tierSaved.push({ vendorId: id, ...values })
      },
      saveEvaluation: async (
        id: string,
        values: {
          eligible: boolean
          ineligibleSince: Date | null
          eligibility: { rules: Array<{ key: string; met: boolean; value: string }> }
        }
      ) => {
        saved.push({
          vendorId: id,
          eligible: values.eligible,
          ineligibleSince: values.ineligibleSince,
          eligibility: values.eligibility,
        })
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
  photoJobs = new Map()
  photosAsked = []
  agreementLatest = { id: 'a1', version: 1, publishedAt: new Date('2026-09-01T00:00:00Z') }
  accepted = new Map([
    [SHORT_GARAGE, 1],
    [NEW_GARAGE, 1],
  ])
  tierStates = new Map()
  tierSaved = []
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
    expect(saved.find((row) => row.vendorId === SHORT_GARAGE)).toMatchObject({
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
    expect(audits.filter((action) => action.startsWith('garage_certification'))).toEqual([
      'garage_certification_lapsed',
    ])
    // The 14 days end with the badge, so they are not saved as still running.
    expect(saved.find((row) => row.vendorId === SHORT_GARAGE)?.ineligibleSince).toBeNull()
  })

  test('a garage that is not certified is saved as eligible and never revoked', async () => {
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(saved.find((row) => row.vendorId === NEW_GARAGE)).toMatchObject({
      vendorId: NEW_GARAGE,
      eligible: true,
      ineligibleSince: null,
    })
    expect(revoked).toHaveLength(0)
  })
})

describe('certificationService.sweep: photo compliance (0045)', () => {
  const jobs = (compliant: number, short: number) => [
    ...Array.from({ length: compliant }, () => ({ garageBefore: 2, garageAfter: 2 })),
    ...Array.from({ length: short }, () => ({ garageBefore: 2, garageAfter: 1 })),
  ]
  const photosRule = (vendorId: string) =>
    saved.find((row) => row.vendorId === vendorId)?.eligibility?.rules.find((rule) => rule.key === 'photos')

  test("reads the batch's jobs over lib/photo-compliance.ts's 90 days, ending now", async () => {
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(photosAsked).toEqual([
      { vendorIds: [SHORT_GARAGE, NEW_GARAGE], since: new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000) },
    ])
  })

  test('photos on 90% of jobs is met; under it, an otherwise eligible garage is not', async () => {
    photoJobs.set(NEW_GARAGE, jobs(27, 3))
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(photosRule(NEW_GARAGE)).toMatchObject({ met: true, value: '90% of 30 jobs' })
    expect(saved.find((row) => row.vendorId === NEW_GARAGE)?.eligible).toBe(true)

    saved = []
    photoJobs.set(NEW_GARAGE, jobs(26, 4))
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(photosRule(NEW_GARAGE)).toMatchObject({ met: false, value: '86% of 30 jobs' })
    expect(saved.find((row) => row.vendorId === NEW_GARAGE)?.eligible).toBe(false)
  })

  test('waived jobs are not graded; with nothing left to grade it passes and says so', async () => {
    photoJobs.set(NEW_GARAGE, [{ garageBefore: 0, garageAfter: 0, waived: true }])
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(photosRule(NEW_GARAGE)).toMatchObject({ met: true, value: 'No jobs to measure yet' })
    expect(saved.find((row) => row.vendorId === NEW_GARAGE)?.eligible).toBe(true)
  })
})

describe('certificationService.sweep: Bronze and Silver (0063)', () => {
  const silverOf = (vendorId: string) => tierSaved.find((row) => row.vendorId === vendorId)

  test('nothing at all before the first garage agreement is published', async () => {
    agreementLatest = undefined
    expect(await certificationService.sweep({ dryRun: false, now: NOW })).toEqual({
      enabled: false,
      reason: 'no_agreement',
    })
    expect(dueAsked).toHaveLength(0)
    expect(saved).toHaveLength(0)
    expect(tierSaved).toHaveLength(0)
  })

  test('a garage meeting Silver is given it tonight, with an audit row', async () => {
    const summary = await certificationService.sweep({ dryRun: false, now: NOW })
    // Both meet Silver (4.1 is under 4.2 for the slipping one, so not it).
    expect(silverOf(NEW_GARAGE)).toMatchObject({ silverAt: NOW, silverShortSince: null, silverEligible: true })
    expect(silverOf(SHORT_GARAGE)).toMatchObject({ silverAt: null, silverEligible: false })
    expect(summary).toMatchObject({ silverGained: 1, silverLost: 0 })
    expect(audits).toEqual(['garage_silver_gained'])
  })

  test('without the agreement there is no Silver, and Gold is not eligible either', async () => {
    accepted = new Map()
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(silverOf(NEW_GARAGE)).toMatchObject({ silverAt: null, silverEligible: false })
    const gold = saved.find((row) => row.vendorId === NEW_GARAGE)
    expect(gold?.eligible).toBe(false)
    expect(gold?.eligibility?.rules.find((rule) => rule.key === 'agreement')).toMatchObject({ met: false })
  })

  test('in the 30 days after a new version, the old acceptance still counts', async () => {
    agreementLatest = { id: 'a2', version: 2, publishedAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000) }
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(silverOf(NEW_GARAGE)).toMatchObject({ silverEligible: true })
  })

  test('Silver held and short: the 14 days start, then it goes on the 14th IST day', async () => {
    const held = new Date('2026-08-01T00:00:00Z')
    tierStates.set(SHORT_GARAGE, { silverAt: held, silverShortSince: null })
    await certificationService.sweep({ dryRun: false, now: NOW })
    expect(silverOf(SHORT_GARAGE)).toMatchObject({ silverAt: held, silverShortSince: NOW })
    expect(audits).not.toContain('garage_silver_lost')

    tierSaved = []
    audits = []
    tierStates.set(SHORT_GARAGE, { silverAt: held, silverShortSince: new Date('2026-10-04T00:30:00Z') })
    const summary = await certificationService.sweep({ dryRun: false, now: NOW })
    expect(silverOf(SHORT_GARAGE)).toMatchObject({ silverAt: null, silverShortSince: null })
    expect(summary).toMatchObject({ silverLost: 1 })
    expect(audits).toContain('garage_silver_lost')
  })
})
