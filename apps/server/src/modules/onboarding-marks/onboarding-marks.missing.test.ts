/**
 * The "documents" missing key worked out per garage, over the batch read
 * (missingFor): a doorstep-only garage has no shop, so its shop photo is not
 * missing; every other way of taking bookings still asks for it. Only the
 * database is stood in for.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'

const { env } = await import('../../lib/env.js')
const { onboardingMarksRepository } = await import('./onboarding-marks.repository.js')
const { onboardingMarksService } = await import('./onboarding-marks.service.js')

const DOORSTEP = 'e2e00000-0000-4000-8000-000000002312'
const WITH_SHOP = 'e2e00000-0000-4000-8000-000000002310'
const PICKUP_ONLY = 'e2e00000-0000-4000-8000-000000002314'
const DOORSTEP_PICKUP = 'e2e00000-0000-4000-8000-000000002315'

const FACTS = (id: string, doorstepEnabled: boolean, dropinEnabled: boolean, pickup = false) => ({
  id,
  logoUrl: 'https://example.com/logo.png',
  lat: 12.6,
  lng: 79.6,
  doorstepEnabled,
  dropinEnabled,
  pickup: pickup ? ('yes' as const) : ('no' as const),
  pickupTermsAcceptedAt: pickup ? new Date('2026-10-01T00:00:00Z') : null,
  doorstepRadiusKm: 10,
  bays: 2,
  photos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
  services: [{ pricingType: 'flat', price: '400.00', priceHatchback: null, priceSedan: null, priceSuv: null }],
  workingHours: [{ isClosed: false }],
})

type Patchable = Record<string, unknown>
const originals: Array<[Patchable, string, unknown]> = []
function patch(target: object, key: string, value: unknown) {
  const object = target as Patchable
  originals.push([object, key, object[key]])
  object[key] = value
}

const ENV_KEYS = ['r2AccountId', 'r2AccessKeyId', 'r2SecretAccessKey', 'r2DocsBucket'] as const
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]))

beforeAll(() => {
  const values = env as unknown as Record<string, string | undefined>
  values.r2AccountId = 'test-account'
  values.r2AccessKeyId = 'test-key'
  values.r2SecretAccessKey = 'test-secret'
  values.r2DocsBucket = 'detlio-docs-test'

  patch(onboardingMarksRepository, 'listMissingFacts', async () => [
    FACTS(DOORSTEP, true, false),
    FACTS(WITH_SHOP, true, true),
    FACTS(PICKUP_ONLY, false, false, true),
    FACTS(DOORSTEP_PICKUP, true, false, true),
  ])
  patch(onboardingMarksRepository, 'listDrawnAreaIds', async () => [])
  patch(onboardingMarksRepository, 'listPayoutAccounts', async () => [])
  // ID and bank proof approved for all three; no shop photo anywhere.
  patch(onboardingMarksRepository, 'listDocumentStates', async (ids: string[]) =>
    ids.flatMap((vendorId) =>
      ['owner_id', 'bank_proof'].map((type) => ({ vendorId, type, status: 'approved' }))
    )
  )
})

afterAll(() => {
  for (const [object, key, value] of originals.reverse()) object[key] = value
  Object.assign(env as unknown as Record<string, unknown>, savedEnv)
})

describe('missing documents, per garage', () => {
  test('a doorstep-only garage with ID and bank proof is missing no documents; the others still need the shop photo', async () => {
    const missing = await onboardingMarksService.missingFor([DOORSTEP, WITH_SHOP, PICKUP_ONLY, DOORSTEP_PICKUP])
    expect(missing.get(DOORSTEP)).not.toContain('documents')
    expect(missing.get(WITH_SHOP)).toContain('documents')
    expect(missing.get(PICKUP_ONLY)).toContain('documents')
    // Doorstep plus pickup & drop, at-garage off: it collects cars, so it has premises.
    expect(missing.get(DOORSTEP_PICKUP)).toContain('documents')
  })
})
