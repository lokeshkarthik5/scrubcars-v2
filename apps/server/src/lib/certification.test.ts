import { describe, expect, test } from 'bun:test'
import {
  CERTIFICATION_RULES,
  PHOTO_COMPLIANCE_NOT_MEASURED,
  addMonths,
  certifyRefusal,
  evaluateEligibility,
  evaluationRunStart,
  fromPhotoCompliance,
  graceEndsOn,
  isCertified,
  lapseReason,
  planEvaluation,
  qualityCheckDateRefusal,
  qualityCheckStanding,
  shortfallLine,
  toSnapshot,
  unmetLine,
  windowStart,
  type CertificationMetrics,
  type EvaluationState,
  type QualityCheckRow,
  type RuleKey,
} from './certification.js'
import { photoCompliance, type PhotoComplianceJob } from './photo-compliance.js'

/** A garage that meets every standard with room to spare. */
const GOOD: CertificationMetrics = {
  documentsVerified: true,
  rating: 4.7,
  reviewCount: 18,
  completed: 40,
  responses: { inTime: 38, missed: 2 },
  complaints: 1,
  garageNoShows: 0,
}

const rule = (metrics: CertificationMetrics, key: RuleKey) =>
  evaluateEligibility(metrics).rules.find((r) => r.key === key)!

describe('evaluateEligibility', () => {
  test('a garage meeting every standard is eligible, and every line says so', () => {
    const result = evaluateEligibility(GOOD)
    expect(result.eligible).toBe(true)
    expect(result.rules.map((r) => r.key)).toEqual([
      'documents',
      'rating',
      'completed',
      'response',
      'complaints',
      'no_shows',
      'photos',
      'bypass',
    ])
    expect(result.rules.every((r) => r.met)).toBe(true)
  })

  test('documents: every required one approved; none while garage documents are off', () => {
    expect(rule(GOOD, 'documents').met).toBe(true)
    expect(rule({ ...GOOD, documentsVerified: false }, 'documents')).toMatchObject({
      met: false,
      value: 'Not all required approved',
    })
    expect(rule({ ...GOOD, documentsVerified: null }, 'documents')).toMatchObject({
      met: false,
      value: 'Garage documents are off',
    })
    expect(evaluateEligibility({ ...GOOD, documentsVerified: false }).eligible).toBe(false)
  })

  test('rating: 4.5 or more from at least 10 reviews, both at the edge', () => {
    expect(rule({ ...GOOD, rating: 4.5, reviewCount: 10 }, 'rating').met).toBe(true)
    expect(rule({ ...GOOD, rating: 4.49, reviewCount: 50 }, 'rating').met).toBe(false)
    expect(rule({ ...GOOD, rating: 5, reviewCount: 9 }, 'rating').met).toBe(false)
    expect(rule({ ...GOOD, rating: null, reviewCount: 0 }, 'rating')).toMatchObject({
      met: false,
      value: 'No reviews yet',
    })
    expect(rule(GOOD, 'rating')).toMatchObject({ value: '4.7 from 18 reviews', target: '4.5 or more, at least 10 reviews' })
  })

  test('completed: at least 20 in the window', () => {
    expect(rule({ ...GOOD, completed: 20 }, 'completed').met).toBe(true)
    expect(rule({ ...GOOD, completed: 19, complaints: 0 }, 'completed').met).toBe(false)
  })

  test('response: 90% answered in time; declines are answers, misses count against', () => {
    expect(rule({ ...GOOD, responses: { inTime: 9, missed: 1 } }, 'response')).toMatchObject({
      met: true,
      value: '90% (9 of 10)',
    })
    expect(rule({ ...GOOD, responses: { inTime: 17, missed: 2 } }, 'response').met).toBe(false)
  })

  test('response: nothing with a deadline yet passes, and says it was not measured', () => {
    expect(rule({ ...GOOD, responses: { inTime: 0, missed: 0 } }, 'response')).toMatchObject({
      met: true,
      measured: false,
      value: 'No bookings with a deadline yet',
    })
  })

  test('complaints: strictly under 3% of completed bookings', () => {
    // 1 of 40 is 2.5%: fine. 1 of 20 is 5%: too many. 3 of 100 is exactly 3%: not under.
    expect(rule({ ...GOOD, complaints: 1, completed: 40 }, 'complaints').met).toBe(true)
    expect(rule({ ...GOOD, complaints: 1, completed: 20 }, 'complaints').met).toBe(false)
    expect(rule({ ...GOOD, complaints: 3, completed: 100 }, 'complaints').met).toBe(false)
    expect(rule({ ...GOOD, complaints: 2, completed: 100 }, 'complaints')).toMatchObject({
      met: true,
      value: '2% (2 complaints)',
    })
  })

  test('complaints: with nothing completed, any complaint is too many', () => {
    expect(rule({ ...GOOD, completed: 0, complaints: 0 }, 'complaints').met).toBe(true)
    expect(rule({ ...GOOD, completed: 0, complaints: 1 }, 'complaints').met).toBe(false)
  })

  test('garage no-shows: none at all', () => {
    expect(rule({ ...GOOD, garageNoShows: 0 }, 'no_shows').met).toBe(true)
    expect(rule({ ...GOOD, garageNoShows: 1 }, 'no_shows')).toMatchObject({ met: false, value: '1', target: 'None' })
  })

  test('photos: left out of the metrics, it is not measured, which passes', () => {
    expect(rule(GOOD, 'photos')).toMatchObject({ met: true, measured: false, value: 'Not measured yet' })
    expect(rule({ ...GOOD, photoCompliance: PHOTO_COMPLIANCE_NOT_MEASURED }, 'photos').met).toBe(true)
  })

  test('photos: once measured, 90% of jobs, and no jobs passes', () => {
    expect(rule({ ...GOOD, photoCompliance: { measured: true, rate: 0.9, jobs: 30 } }, 'photos')).toMatchObject({
      met: true,
      value: '90% of 30 jobs',
    })
    expect(rule({ ...GOOD, photoCompliance: { measured: true, rate: 0.85, jobs: 30 } }, 'photos').met).toBe(false)
    expect(rule({ ...GOOD, photoCompliance: { measured: true, rate: null, jobs: 0 } }, 'photos').met).toBe(true)
    expect(evaluateEligibility({ ...GOOD, photoCompliance: { measured: true, rate: 0.5, jobs: 30 } }).eligible).toBe(false)
  })

  describe("photos: lib/photo-compliance.ts's figure (0045)", () => {
    const NOW = new Date('2026-10-18T06:30:00Z')
    const job = (daysAgo: number, before: number, after: number, extra: Partial<PhotoComplianceJob> = {}) => ({
      finishedAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
      garageBefore: before,
      garageAfter: after,
      waived: false,
      markedTest: false,
      ...extra,
    })
    const graded = (jobs: PhotoComplianceJob[]) =>
      rule({ ...GOOD, photoCompliance: fromPhotoCompliance(photoCompliance(jobs, NOW)) }, 'photos')

    test('9 of 10 jobs with 2 before and 2 after is 90%: met', () => {
      const jobs = [...Array.from({ length: 9 }, () => job(5, 2, 3)), job(5, 1, 2)]
      expect(fromPhotoCompliance(photoCompliance(jobs, NOW))).toEqual({ measured: true, rate: 0.9, jobs: 10 })
      expect(graded(jobs)).toMatchObject({ met: true, measured: true, value: '90% of 10 jobs' })
    })

    test('89.x% is rounded down, as admin shows it, and falls short', () => {
      const jobs = [...Array.from({ length: 17 }, () => job(5, 2, 2)), job(5, 2, 0), job(5, 0, 2)]
      expect(graded(jobs)).toMatchObject({ met: false, value: '89% of 19 jobs' })
    })

    test('waived and Test-marked jobs, and jobs older than 90 days, are not graded', () => {
      const jobs = [
        ...Array.from({ length: 9 }, () => job(5, 2, 2)),
        job(5, 0, 0, { waived: true }),
        job(5, 0, 0, { markedTest: true }),
        job(91, 0, 0),
        job(4, 2, 1),
      ]
      expect(graded(jobs)).toMatchObject({ met: true, value: '90% of 10 jobs' })
    })

    test('nothing to grade passes and says so', () => {
      expect(graded([job(5, 0, 0, { waived: true })])).toMatchObject({
        met: true,
        measured: false,
        value: 'No jobs to measure yet',
      })
    })
  })

  test('bypass reports (0052): any strike in 180 days makes a garage ineligible', () => {
    expect(rule(GOOD, 'bypass')).toMatchObject({ met: true, measured: true, value: 'None confirmed', target: 'None confirmed' })
    expect(rule({ ...GOOD, bypassStrikes: 0 }, 'bypass').met).toBe(true)
    expect(rule({ ...GOOD, bypassStrikes: 1 }, 'bypass')).toMatchObject({ met: false, value: '1 confirmed' })
    const result = evaluateEligibility({ ...GOOD, bypassStrikes: 2 })
    expect(result.eligible).toBe(false)
    expect(unmetLine(result)).toBe('Bypass reports (180 days)')
  })

  test('a certified garage with a confirmed report starts the usual 14 days, then loses the seal', () => {
    const state: EvaluationState = { certified: true, ineligibleSince: null, lastEligible: true, eligibleAlertedAt: null }
    const eligible = evaluateEligibility({ ...GOOD, bypassStrikes: 1 }).eligible
    const first = planEvaluation(state, { eligible, checkValid: true }, new Date('2026-10-18T00:00:00Z'))
    expect(first).toMatchObject({ alert: 'at_risk', lapse: false })
    const later = planEvaluation(
      { ...state, ineligibleSince: first.ineligibleSince },
      { eligible, checkValid: true },
      new Date('2026-11-01T00:00:00Z')
    )
    expect(later).toMatchObject({ alert: 'lapsed', lapse: true })
  })

  test('one standard missed is not eligible, and the line names it', () => {
    const result = evaluateEligibility({ ...GOOD, rating: 4.2, garageNoShows: 1 })
    expect(result.eligible).toBe(false)
    expect(unmetLine(result)).toBe('Rating, Garage no-shows (90 days)')
  })
})

describe('the window', () => {
  test('90 IST days, today included: from the IST midnight 89 days back', () => {
    // 18 Oct 2026, 10:00 IST → from 21 Jul 2026, 00:00 IST.
    expect(windowStart(new Date('2026-10-18T04:30:00Z')).toISOString()).toBe('2026-07-20T18:30:00.000Z')
    // Just after IST midnight it is already the 19th.
    expect(windowStart(new Date('2026-10-18T18:31:00Z')).toISOString()).toBe('2026-07-21T18:30:00.000Z')
  })
})

describe('quality checks', () => {
  const at = (iso: string) => new Date(iso)
  const check = (checkedOn: string, result: 'pass' | 'fail', created = '2026-10-01T00:00:00Z'): QualityCheckRow => ({
    checkedOn,
    result,
    createdAt: at(created),
  })

  test('addMonths keeps the day where the month has it', () => {
    expect(addMonths('2026-10-18', -6)).toBe('2026-04-18')
    expect(addMonths('2026-08-31', -6)).toBe('2026-02-28')
    expect(addMonths('2026-03-31', 6)).toBe('2026-09-30')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
  })

  test('a pass in the last 6 months stands, until 6 months after the visit', () => {
    const standing = qualityCheckStanding([check('2026-05-01', 'pass')], '2026-10-18')
    expect(standing).toMatchObject({ valid: true, status: 'passed', validUntil: '2026-11-01' })
    // On the day six months on it still counts; the day after, it does not.
    expect(qualityCheckStanding([check('2026-04-18', 'pass')], '2026-10-18').valid).toBe(true)
    expect(qualityCheckStanding([check('2026-04-17', 'pass')], '2026-10-18')).toMatchObject({
      valid: false,
      status: 'expired',
    })
  })

  test('a later fail overrides an earlier pass; a later pass overrides a fail', () => {
    expect(
      qualityCheckStanding([check('2026-06-01', 'pass'), check('2026-09-01', 'fail')], '2026-10-18')
    ).toMatchObject({ valid: false, status: 'failed' })
    expect(
      qualityCheckStanding([check('2026-06-01', 'fail'), check('2026-09-01', 'pass')], '2026-10-18')
    ).toMatchObject({ valid: true, status: 'passed' })
  })

  test('two checks on one day: the one recorded last decides', () => {
    const checks = [
      check('2026-09-01', 'fail', '2026-09-01T10:00:00Z'),
      check('2026-09-01', 'pass', '2026-09-01T12:00:00Z'),
    ]
    expect(qualityCheckStanding(checks, '2026-10-18').valid).toBe(true)
    expect(qualityCheckStanding([...checks].reverse(), '2026-10-18').valid).toBe(true)
  })

  test('no checks at all is none; checks dated after today are ignored', () => {
    expect(qualityCheckStanding([], '2026-10-18')).toMatchObject({ valid: false, status: 'none', latest: null })
    expect(qualityCheckStanding([check('2026-10-19', 'pass')], '2026-10-18').valid).toBe(false)
  })

  test('a check date may not be in the future or over a year back', () => {
    expect(qualityCheckDateRefusal('2026-10-18', '2026-10-18')).toBeNull()
    expect(qualityCheckDateRefusal('2026-10-19', '2026-10-18')).toBe('future')
    expect(qualityCheckDateRefusal('2025-10-18', '2026-10-18')).toBeNull()
    expect(qualityCheckDateRefusal('2025-10-17', '2026-10-18')).toBe('too_old')
  })
})

describe('certified and Certify', () => {
  const at = new Date('2026-10-18T04:30:00Z')

  test('certified is certified and not revoked since', () => {
    expect(isCertified(undefined)).toBe(false)
    expect(isCertified({ certifiedAt: null, revokedAt: null })).toBe(false)
    expect(isCertified({ certifiedAt: at, revokedAt: null })).toBe(true)
    expect(isCertified({ certifiedAt: at, revokedAt: at })).toBe(false)
  })

  test('Certify needs eligible and a passing check, not in the Bin, not already certified', () => {
    const ok = { inBin: false, certified: false, eligible: true, checkValid: true }
    expect(certifyRefusal(ok)).toBeNull()
    expect(certifyRefusal({ ...ok, inBin: true })).toBe('in_bin')
    expect(certifyRefusal({ ...ok, certified: true })).toBe('already_certified')
    expect(certifyRefusal({ ...ok, eligible: false })).toBe('not_eligible')
    expect(certifyRefusal({ ...ok, checkValid: false })).toBe('no_passing_check')
  })
})

describe('the nightly evaluation', () => {
  /** An IST morning, day `n` of October 2026 at 06:10. */
  const morning = (day: number) => new Date(Date.UTC(2026, 9, day, 0, 40))
  const CERTIFIED: EvaluationState = {
    certified: true,
    ineligibleSince: null,
    lastEligible: true,
    eligibleAlertedAt: null,
  }
  const OK = { eligible: true, checkValid: true }
  const SHORT = { eligible: false, checkValid: true }

  test('the run starts at 05:00 IST; before then, the night belongs to yesterday', () => {
    expect(evaluationRunStart(new Date('2026-10-18T00:00:00Z')).toISOString()).toBe('2026-10-17T23:30:00.000Z')
    expect(evaluationRunStart(new Date('2026-10-17T23:29:00Z')).toISOString()).toBe('2026-10-16T23:30:00.000Z')
  })

  test('a certified garage that still stands: nothing happens', () => {
    expect(planEvaluation(CERTIFIED, OK, morning(10))).toMatchObject({
      lapse: false,
      alert: null,
      ineligibleSince: null,
    })
  })

  test('the first night short starts the 14 days and tells ops it is at risk', () => {
    const plan = planEvaluation(CERTIFIED, SHORT, morning(1))
    expect(plan).toMatchObject({ lapse: false, alert: 'at_risk', daysShort: 0 })
    expect(plan.ineligibleSince).toEqual(morning(1))
    expect(graceEndsOn(plan.ineligibleSince!)).toBe('2026-10-14')
  })

  test('still short on days 2–13: quiet; on the 14th day since, it lapses', () => {
    const state = { ...CERTIFIED, ineligibleSince: morning(1) }
    for (let day = 2; day <= 14; day += 1) {
      expect(planEvaluation(state, SHORT, morning(day))).toMatchObject({ lapse: false, alert: null })
    }
    expect(planEvaluation(state, SHORT, morning(15))).toMatchObject({ lapse: true, alert: 'lapsed', daysShort: 14 })
  })

  test('counted in IST days: a later tick on the 14th day does not lapse early or late', () => {
    // Short since 23:50 IST on the 1st (18:20 UTC): the 15th is day 14.
    const state = { ...CERTIFIED, ineligibleSince: new Date('2026-10-01T18:20:00Z') }
    // 23:00 IST on the 14th: day 13. 00:10 IST on the 15th: day 14.
    expect(planEvaluation(state, SHORT, new Date('2026-10-14T17:30:00Z')).lapse).toBe(false)
    expect(planEvaluation(state, SHORT, new Date('2026-10-14T18:40:00Z')).lapse).toBe(true)
  })

  test('one night meeting the standards again clears the 14 days', () => {
    const state = { ...CERTIFIED, ineligibleSince: morning(1) }
    expect(planEvaluation(state, OK, morning(10))).toMatchObject({ ineligibleSince: null, lapse: false, alert: null })
    // Short again afterwards starts a fresh count.
    expect(planEvaluation({ ...state, ineligibleSince: null }, SHORT, morning(11))).toMatchObject({
      alert: 'at_risk',
      ineligibleSince: morning(11),
    })
  })

  test("Detlio's check running out or failing counts as short too", () => {
    expect(planEvaluation(CERTIFIED, { eligible: true, checkValid: false }, morning(1)).alert).toBe('at_risk')
  })

  test('not certified: told once when it becomes eligible, then not every night', () => {
    const fresh: EvaluationState = { certified: false, ineligibleSince: null, lastEligible: false, eligibleAlertedAt: null }
    const first = planEvaluation(fresh, { eligible: true, checkValid: false }, morning(1))
    expect(first).toMatchObject({ alert: 'eligible', eligibleAlertedAt: morning(1), ineligibleSince: null })
    // Next night, still eligible: no news.
    expect(
      planEvaluation({ ...fresh, lastEligible: true, eligibleAlertedAt: morning(1) }, OK, morning(2)).alert
    ).toBeNull()
    // Dips and comes back within 14 days: quiet; after, told again.
    const dipped = { ...fresh, lastEligible: false, eligibleAlertedAt: morning(1) }
    expect(planEvaluation(dipped, OK, morning(10)).alert).toBeNull()
    expect(planEvaluation(dipped, OK, morning(15)).alert).toBe('eligible')
    // Never evaluated before counts as a change.
    expect(planEvaluation({ ...fresh, lastEligible: null }, OK, morning(1)).alert).toBe('eligible')
  })

  test('not certified and not eligible: nothing', () => {
    expect(
      planEvaluation(
        { certified: false, ineligibleSince: null, lastEligible: false, eligibleAlertedAt: null },
        SHORT,
        morning(1)
      )
    ).toMatchObject({ alert: null, lapse: false, ineligibleSince: null })
  })

  test("the lapse's reason names what fell short", () => {
    const eligibility = evaluateEligibility({ ...GOOD, rating: 4.1 })
    expect(lapseReason(shortfallLine(eligibility, { valid: false, status: 'expired' }))).toBe(
      "Did not meet the Detlio Certified standards for 14 days: Rating; Detlio's check is over 6 months old."
    )
    expect(shortfallLine(evaluateEligibility(GOOD), { valid: false, status: 'failed' })).toBe(
      "Detlio's latest check did not pass"
    )
  })
})

describe('the snapshot and the numbers', () => {
  test('stores what was measured, when, and whether the check stood', () => {
    const at = new Date('2026-10-18T00:00:00Z')
    const snapshot = toSnapshot(evaluateEligibility(GOOD), false, at)
    expect(snapshot).toMatchObject({ version: 1, evaluatedAt: at.toISOString(), eligible: true, checkValid: false })
    expect(snapshot.rules).toHaveLength(8)
  })

  test('the thresholds are the ones the owner was given', () => {
    expect(CERTIFICATION_RULES).toMatchObject({
      windowDays: 90,
      minRating: 4.5,
      minReviews: 10,
      minCompleted: 20,
      minResponseRate: 0.9,
      maxComplaintRate: 0.03,
      maxGarageNoShows: 0,
      minPhotoCompliance: 0.9,
      maxBypassStrikes: 0,
      bypassWindowDays: 180,
      qualityCheckMonths: 6,
      graceDays: 14,
    })
    expect([...CERTIFICATION_RULES.complaintCategories]).toEqual(['damage', 'service_quality', 'garage_no_show'])
  })
})
