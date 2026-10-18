import { describe, expect, test } from 'bun:test'
import {
  PHOTO_COMPLIANCE_DAYS,
  jobMetPhotoStandard,
  photoCompliance,
  photoComplianceByGarage,
  photoComplianceSince,
  type PhotoComplianceJob,
} from './photo-compliance.js'

const NOW = new Date('2026-10-18T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

const job = (overrides: Partial<PhotoComplianceJob> = {}): PhotoComplianceJob => ({
  finishedAt: daysAgo(1),
  garageBefore: 2,
  garageAfter: 2,
  waived: false,
  markedTest: false,
  ...overrides,
})

describe('photo compliance', () => {
  test('a job meets the standard with 2 before and 2 after photos of the garage', () => {
    expect(jobMetPhotoStandard({ garageBefore: 2, garageAfter: 2 })).toBe(true)
    expect(jobMetPhotoStandard({ garageBefore: 6, garageAfter: 3 })).toBe(true)
    expect(jobMetPhotoStandard({ garageBefore: 2, garageAfter: 1 })).toBe(false)
    expect(jobMetPhotoStandard({ garageBefore: 0, garageAfter: 2 })).toBe(false)
  })

  test('the share of completed jobs that met it, rounded down', () => {
    const result = photoCompliance(
      [job(), job(), job({ garageAfter: 0 })],
      NOW
    )
    expect(result).toEqual({ jobs: 3, compliant: 2, waived: 0, percent: 66 })
    // 199 of 200 is 99%, never 100%.
    const many = [...Array.from({ length: 199 }, () => job()), job({ garageBefore: 1 })]
    expect(photoCompliance(many, NOW).percent).toBe(99)
  })

  test(`only the last ${PHOTO_COMPLIANCE_DAYS} days count`, () => {
    const result = photoCompliance(
      [job({ finishedAt: daysAgo(89) }), job({ finishedAt: daysAgo(91), garageBefore: 0 })],
      NOW
    )
    expect(result).toEqual({ jobs: 1, compliant: 1, waived: 0, percent: 100 })
    expect(photoComplianceSince(NOW).getTime()).toBe(NOW.getTime() - 90 * DAY)
  })

  test('waived jobs are left out and counted apart; Test-marked ones are left out', () => {
    const result = photoCompliance(
      [job({ waived: true, garageBefore: 0 }), job({ markedTest: true, garageBefore: 0 }), job({ garageAfter: 1 })],
      NOW
    )
    expect(result).toEqual({ jobs: 1, compliant: 0, waived: 1, percent: 0 })
  })

  test('no jobs is no figure, not 0%', () => {
    expect(photoCompliance([], NOW)).toEqual({ jobs: 0, compliant: 0, waived: 0, percent: null })
    expect(photoCompliance([job({ waived: true })], NOW).percent).toBeNull()
  })

  test('per garage', () => {
    const map = photoComplianceByGarage(
      [
        { ...job(), vendorId: 'a' },
        { ...job({ garageBefore: 0 }), vendorId: 'a' },
        { ...job(), vendorId: 'b' },
      ],
      NOW
    )
    expect(map.get('a')?.percent).toBe(50)
    expect(map.get('b')?.percent).toBe(100)
    expect(map.get('c')).toBeUndefined()
  })
})
