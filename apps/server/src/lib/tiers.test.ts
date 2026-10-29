import { describe, expect, test } from 'bun:test'
import type { AgreementStanding } from './agreements.js'
import { CERTIFICATION_RULES, evaluateEligibility, type CertificationMetrics } from './certification.js'
import {
  DEFAULT_TIER_SWITCHES,
  TIER_RULES,
  agreementStep,
  goldSteps,
  heldTier,
  planSilver,
  progressLine,
  shownTier,
  silverAndAboveTiers,
  silverFilterOffered,
  silverSteps,
  tierGraceEndsOn,
  tierProgress,
  tierRunPaused,
  toTierSnapshot,
  type TierInput,
  type TierStepKey,
  type TierSwitches,
} from './tiers.js'

const ACCEPTED: AgreementStanding = {
  status: 'accepted',
  bronze: true,
  latestVersion: 1,
  acceptedVersion: 1,
  acceptBy: null,
}
const NOT_ACCEPTED: AgreementStanding = {
  status: 'not_accepted',
  bronze: false,
  latestVersion: 1,
  acceptedVersion: null,
  acceptBy: null,
}
const GRACE: AgreementStanding = {
  status: 'grace',
  bronze: true,
  latestVersion: 2,
  acceptedVersion: 1,
  acceptBy: '2026-12-01',
}
const NOT_PUBLISHED: AgreementStanding = {
  status: 'not_published',
  bronze: false,
  latestVersion: null,
  acceptedVersion: null,
  acceptBy: null,
}

/** Exactly at every Silver threshold. */
const SILVER_EDGE: CertificationMetrics = {
  documentsVerified: true,
  rating: 4.2,
  reviewCount: 5,
  completed: 10,
  responses: { inTime: 17, missed: 3 }, // 85%
  complaints: 0,
  garageNoShows: 0,
}

/** Comfortably Gold. */
const GOLD: CertificationMetrics = {
  documentsVerified: true,
  rating: 4.7,
  reviewCount: 18,
  completed: 40,
  responses: { inTime: 38, missed: 2 },
  complaints: 1,
  garageNoShows: 0,
  photoCompliance: { measured: true, rate: 0.95, jobs: 40 },
  bypassStrikes: 0,
}

const PASSED = { valid: true, status: 'passed' as const }
const NO_CHECK = { valid: false, status: 'none' as const }

const step = (metrics: CertificationMetrics, key: TierStepKey) => silverSteps(metrics).find((s) => s.key === key)!

describe('the thresholds live in one place', () => {
  test('Silver, Bronze and the grace; Gold is CERTIFICATION_RULES itself', () => {
    expect(TIER_RULES.silver).toEqual({
      windowDays: 90,
      minRating: 4.2,
      minReviews: 5,
      minCompleted: 10,
      minResponseRate: 0.85,
      maxGarageNoShows: 0,
    })
    expect(TIER_RULES.bronze.agreementGraceDays).toBe(30)
    expect(TIER_RULES.graceDays).toBe(14)
    expect(TIER_RULES.gold).toBe(CERTIFICATION_RULES)
  })

  test("Gold's standards are at least as strict as every Silver one", () => {
    expect(TIER_RULES.gold.minRating).toBeGreaterThanOrEqual(TIER_RULES.silver.minRating)
    expect(TIER_RULES.gold.minReviews).toBeGreaterThanOrEqual(TIER_RULES.silver.minReviews)
    expect(TIER_RULES.gold.minCompleted).toBeGreaterThanOrEqual(TIER_RULES.silver.minCompleted)
    expect(TIER_RULES.gold.minResponseRate).toBeGreaterThanOrEqual(TIER_RULES.silver.minResponseRate)
    expect(TIER_RULES.gold.maxGarageNoShows).toBeLessThanOrEqual(TIER_RULES.silver.maxGarageNoShows)
    expect(TIER_RULES.gold.windowDays).toBe(TIER_RULES.silver.windowDays)
  })
})

describe('Silver steps, each at its edge', () => {
  test('every step met exactly at the threshold', () => {
    const steps = silverSteps(SILVER_EDGE)
    expect(steps.map((s) => s.key)).toEqual(['documents', 'rating', 'completed', 'response', 'no_shows'])
    expect(steps.every((s) => s.met)).toBe(true)
  })

  test('documents: checked, not checked, or not open', () => {
    expect(step({ ...SILVER_EDGE, documentsVerified: false }, 'documents')).toMatchObject({
      met: false,
      action: 'documents',
    })
    expect(step({ ...SILVER_EDGE, documentsVerified: null }, 'documents')).toMatchObject({
      met: false,
      measured: false,
      action: null,
    })
  })

  test('rating: 4.2 from 5 passes; 4.19 or 4 reviews does not', () => {
    expect(step({ ...SILVER_EDGE, rating: 4.19 }, 'rating').met).toBe(false)
    expect(step({ ...SILVER_EDGE, reviewCount: 4, rating: 5 }, 'rating').met).toBe(false)
    expect(step({ ...SILVER_EDGE, rating: null, reviewCount: 0 }, 'rating')).toMatchObject({
      met: false,
      value: 'No reviews yet',
    })
  })

  test('completed: 10 passes, 9 does not', () => {
    expect(step({ ...SILVER_EDGE, completed: 9 }, 'completed').met).toBe(false)
  })

  test('answered in time: 85% passes, just under does not, none to measure passes', () => {
    expect(step({ ...SILVER_EDGE, responses: { inTime: 84, missed: 16 } }, 'response').met).toBe(false)
    expect(step({ ...SILVER_EDGE, responses: { inTime: 85, missed: 15 } }, 'response').met).toBe(true)
    expect(step({ ...SILVER_EDGE, responses: { inTime: 0, missed: 0 } }, 'response')).toMatchObject({
      met: true,
      measured: false,
    })
  })

  test('no-shows: none passes, one does not', () => {
    expect(step({ ...SILVER_EDGE, garageNoShows: 1 }, 'no_shows').met).toBe(false)
  })
})

describe('the agreement step', () => {
  test('met only when the latest is accepted; in the 30 days it is still to do', () => {
    expect(agreementStep(ACCEPTED)).toMatchObject({ met: true, action: 'agreement' })
    expect(agreementStep(GRACE)).toMatchObject({
      met: false,
      action: 'agreement',
      value: 'Version 2 to accept by 2026-12-01',
    })
    expect(agreementStep(NOT_ACCEPTED)).toMatchObject({ met: false, value: 'Not accepted yet' })
    expect(agreementStep(NOT_PUBLISHED)).toMatchObject({ met: false, measured: false, action: null })
  })
})

describe('Gold steps', () => {
  test('the stricter standards, the ones Silver lacks, and the check', () => {
    const steps = goldSteps(GOLD, PASSED)
    expect(steps.map((s) => s.key)).toEqual([
      'rating',
      'completed',
      'response',
      'complaints',
      'photos',
      'bypass',
      'quality_check',
    ])
    expect(steps.every((s) => s.met)).toBe(true)
    expect(goldSteps(SILVER_EDGE, PASSED).find((s) => s.key === 'rating')!.met).toBe(false)
    expect(goldSteps(GOLD, NO_CHECK).find((s) => s.key === 'quality_check')!.met).toBe(false)
    expect(goldSteps({ ...GOLD, bypassStrikes: 1 }, PASSED).find((s) => s.key === 'bypass')!.met).toBe(false)
    expect(goldSteps({ ...GOLD, complaints: 2 }, PASSED).find((s) => s.key === 'complaints')!.met).toBe(false)
  })

  test("agree with Gold's eligibility (lib/certification.ts) on the same numbers", () => {
    for (const metrics of [GOLD, SILVER_EDGE, { ...GOLD, complaints: 5 }, { ...GOLD, bypassStrikes: 1 }]) {
      const fromSteps =
        silverSteps(metrics).every((s) => s.met) && goldSteps(metrics, PASSED).every((s) => s.met)
      expect(fromSteps).toBe(evaluateEligibility({ ...metrics, agreement: true }).eligible)
    }
  })
})

describe('tierProgress', () => {
  const input = (patch: Partial<TierInput>): TierInput => ({
    agreement: ACCEPTED,
    metrics: SILVER_EDGE,
    check: NO_CHECK,
    silverHeld: false,
    goldHeld: false,
    ...patch,
  })

  test('no tier yet: next is Bronze, the agreement', () => {
    const progress = tierProgress(input({ agreement: NOT_ACCEPTED }))
    expect(progress.tier).toBeNull()
    expect(progress.next).toMatchObject({ tier: 'bronze', done: 0, total: 1 })
    expect(progressLine(progress)).toBe('No tier yet. Next: Bronze, 0 of 1 done.')
  })

  test("Bronze working towards Silver: 'You're Bronze. Next: Silver, 3 of 5 done.'", () => {
    const progress = tierProgress(input({ metrics: { ...SILVER_EDGE, documentsVerified: false, completed: 3 } }))
    expect(progress.tier).toBe('bronze')
    expect(progress.silverEligible).toBe(false)
    expect(progress.next).toMatchObject({ tier: 'silver', done: 3, total: 5 })
    expect(progressLine(progress)).toBe("You're Bronze. Next: Silver, 3 of 5 done.")
  })

  test('Silver is eligible only with Bronze; in the 30 days Bronze counts', () => {
    expect(tierProgress(input({})).silverEligible).toBe(true)
    expect(tierProgress(input({ agreement: NOT_ACCEPTED })).silverEligible).toBe(false)
    expect(tierProgress(input({ agreement: GRACE })).silverEligible).toBe(true)
  })

  test('a tier above Bronze lists the agreement first while it is to do', () => {
    const progress = tierProgress(input({ agreement: GRACE }))
    expect(progress.tier).toBe('bronze')
    expect(progress.next!.steps[0]!.key).toBe('agreement')
    expect(progress.next).toMatchObject({ tier: 'silver', total: 6, done: 5 })
  })

  test('Silver held: next is Gold; Gold held: the top', () => {
    const silver = tierProgress(input({ silverHeld: true, metrics: GOLD, check: PASSED }))
    expect(silver.tier).toBe('silver')
    // Gold's own seven, plus Silver's documents and no missed bookings.
    expect(silver.next).toMatchObject({ tier: 'gold', done: 9, total: 9 })
    expect(silver.next!.steps.map((s) => s.key)).toEqual([
      'documents',
      'no_shows',
      'rating',
      'completed',
      'response',
      'complaints',
      'photos',
      'bypass',
      'quality_check',
    ])
    expect(silver.keep).toEqual([])
    const gold = tierProgress(input({ silverHeld: true, goldHeld: true, metrics: GOLD, check: PASSED }))
    expect(gold.tier).toBe('gold')
    expect(gold.next).toBeNull()
    expect(progressLine(gold)).toBe("You're Gold. That's the top tier.")
  })

  test('stored tiers stand while short (the 14 days), even without Bronze, and say what to put right', () => {
    const silver = tierProgress(input({ silverHeld: true, agreement: NOT_ACCEPTED }))
    expect(silver.tier).toBe('silver')
    expect(silver.keep.map((s) => s.key)).toEqual(['agreement'])
    const gold = tierProgress(input({ goldHeld: true, agreement: NOT_ACCEPTED, metrics: { ...GOLD, documentsVerified: false }, check: PASSED }))
    expect(gold.tier).toBe('gold')
    expect(gold.next).toBeNull()
    expect(gold.keep.map((s) => s.key)).toEqual(['agreement', 'documents'])
    expect(tierProgress(input({ agreement: ACCEPTED })).keep).toEqual([])
  })
})

describe('what customers see', () => {
  const ALL: TierSwitches = DEFAULT_TIER_SWITCHES
  const GOLD_ONLY: TierSwitches = { bronze: false, silver: false, gold: true }

  test('the held tier is the highest of the three', () => {
    expect(heldTier({ gold: true, silver: false, bronze: false })).toBe('gold')
    expect(heldTier({ gold: false, silver: true, bronze: false })).toBe('silver')
    expect(heldTier({ gold: false, silver: false, bronze: true })).toBe('bronze')
    expect(heldTier({ gold: false, silver: false, bronze: false })).toBeNull()
  })

  const ALL_HELD = { gold: true, silver: true, bronze: true }
  const BRONZE_ONLY = { gold: false, silver: false, bronze: true }

  test('the highest switched-on tier the garage holds', () => {
    expect(shownTier(ALL_HELD, ALL, false)).toBe('gold')
    expect(shownTier(ALL_HELD, { ...ALL, gold: false }, false)).toBe('silver')
    expect(shownTier(ALL_HELD, { bronze: true, silver: false, gold: false }, false)).toBe('bronze')
    expect(shownTier({ gold: false, silver: true, bronze: true }, GOLD_ONLY, false)).toBeNull()
    expect(shownTier(BRONZE_ONLY, GOLD_ONLY, false)).toBeNull()
    expect(shownTier(ALL_HELD, GOLD_ONLY, false)).toBe('gold')
    expect(shownTier({ gold: false, silver: false, bronze: false }, ALL, false)).toBeNull()
  })

  test('Gold comes with Silver; Bronze only on the agreement itself', () => {
    // Gold without a stored Silver row still shows Silver while Gold is off.
    expect(shownTier({ gold: true, silver: false, bronze: true }, { ...ALL, gold: false }, false)).toBe('silver')
    // Gold or Silver in its 14 days without the agreement never shows Bronze.
    expect(shownTier({ gold: true, silver: true, bronze: false }, { bronze: true, silver: false, gold: false }, false)).toBeNull()
    expect(shownTier({ gold: false, silver: true, bronze: false }, ALL, false)).toBe('silver')
  })

  test('nothing while the garage is hidden, whatever it holds', () => {
    expect(shownTier(ALL_HELD, ALL, true)).toBeNull()
    expect(shownTier(BRONZE_ONLY, ALL, true)).toBeNull()
  })

  test('"Silver & above" is offered while Silver or Gold is on', () => {
    expect(silverFilterOffered(ALL)).toBe(true)
    expect(silverFilterOffered(GOLD_ONLY)).toBe(true)
    expect(silverFilterOffered({ bronze: true, silver: true, gold: false })).toBe(true)
    expect(silverFilterOffered({ bronze: true, silver: false, gold: false })).toBe(false)
    expect(silverAndAboveTiers(GOLD_ONLY)).toEqual(['gold'])
    expect(silverAndAboveTiers(ALL)).toEqual(['silver', 'gold'])
  })
})

describe('planSilver', () => {
  const night = (iso: string) => new Date(iso)
  const held = night('2026-10-01T00:00:00Z')

  test('given the night it is eligible', () => {
    const now = night('2026-11-02T00:00:00Z')
    expect(planSilver({ silverAt: null, shortSince: null }, true, now)).toEqual({
      silverAt: now,
      shortSince: null,
      lostAt: null,
      event: 'gained',
      daysShort: 0,
    })
    expect(planSilver({ silverAt: null, shortSince: null }, false, now).event).toBeNull()
  })

  test('held and eligible: stands, any shortfall cleared', () => {
    const plan = planSilver({ silverAt: held, shortSince: night('2026-11-01T00:00:00Z') }, true, night('2026-11-03T00:00:00Z'))
    expect(plan).toMatchObject({ silverAt: held, shortSince: null, event: null })
  })

  test('the first night short starts the 14 days; it goes on the 14th IST day', () => {
    const first = night('2026-11-01T00:00:00Z') // 05:30 IST on 1 Nov
    const start = planSilver({ silverAt: held, shortSince: null }, false, first)
    expect(start).toMatchObject({ silverAt: held, shortSince: first, event: 'at_risk', daysShort: 0 })
    const day13 = planSilver({ silverAt: held, shortSince: first }, false, night('2026-11-14T00:00:00Z'))
    expect(day13).toMatchObject({ silverAt: held, event: null, daysShort: 13 })
    const day14 = night('2026-11-15T00:00:00Z')
    expect(planSilver({ silverAt: held, shortSince: first }, false, day14)).toEqual({
      silverAt: null,
      shortSince: null,
      lostAt: day14,
      event: 'lost',
      daysShort: 14,
    })
    expect(tierGraceEndsOn(first)).toBe('2026-11-14')
  })
})

describe('tierRunPaused', () => {
  test('changes nothing while documents are off or before the first agreement', () => {
    expect(tierRunPaused({ documentsOn: false, agreementPublished: true })).toBe('documents_off')
    expect(tierRunPaused({ documentsOn: true, agreementPublished: false })).toBe('no_agreement')
    expect(tierRunPaused({ documentsOn: true, agreementPublished: true })).toBeNull()
  })
})

describe('toTierSnapshot', () => {
  test("the night's checklist: the agreement, then Silver's steps", () => {
    const now = new Date('2026-11-02T00:00:00Z')
    const snap = toTierSnapshot(ACCEPTED, SILVER_EDGE, now)
    expect(snap).toMatchObject({ version: 1, bronze: true, silverEligible: true, evaluatedAt: now.toISOString() })
    expect(snap.steps.map((s) => s.key)).toEqual(['agreement', 'documents', 'rating', 'completed', 'response', 'no_shows'])
    expect(toTierSnapshot(NOT_ACCEPTED, SILVER_EDGE, now).silverEligible).toBe(false)
    expect(toTierSnapshot(GRACE, SILVER_EDGE, now).silverEligible).toBe(true)
  })
})
