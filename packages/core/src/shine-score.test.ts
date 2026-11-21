import { describe, expect, test } from 'bun:test'
import type { JobPhoto } from './types'
import {
  jobPhotoForArea,
  photoStats,
  photoWarning,
  scansLeftLine,
  shineShareText,
} from './shine-score'

describe('the on-device photo check', () => {
  test('a flat dark image is dark; a flat bright one is blurry; a sharp bright one is fine', () => {
    const w = 32
    const h = 32
    const dark = new Uint8Array(w * h).fill(20)
    const flat = new Uint8Array(w * h).fill(160)
    const checker = new Uint8Array(w * h).map((_, i) => ((i % w) + Math.floor(i / w)) % 2 === 0 ? 40 : 230)
    expect(photoWarning(photoStats(dark, w, h))).toBe('dark')
    expect(photoWarning(photoStats(flat, w, h))).toBe('blurry')
    expect(photoWarning(photoStats(checker, w, h))).toBeNull()
  })

  test('nothing to measure is no warning', () => {
    expect(photoWarning(null)).toBeNull()
    expect(photoStats([], 0, 0)).toEqual({ brightness: 0, sharpness: 0 })
  })
})

describe('job photos for an area', () => {
  const photo = (over: Partial<JobPhoto>): JobPhoto => ({
    id: 'p',
    stage: 'before',
    url: 'https://x/p.jpg',
    createdAt: '2026-11-15T05:00:00Z',
    angle: 'front',
    by: 'garage',
    ...over,
  })

  test('the garage’s newest photo of the area’s first angle that has one', () => {
    const photos = [
      photo({ id: 'old', angle: 'interior', createdAt: '2026-11-15T04:00:00Z' }),
      photo({ id: 'new', angle: 'interior', createdAt: '2026-11-15T05:00:00Z' }),
      photo({ id: 'mine', angle: 'right', by: 'customer' }),
      photo({ id: 'right', angle: 'right', stage: 'after' }),
    ]
    expect(jobPhotoForArea(photos, 'seats', 'before')?.id).toBe('new')
    expect(jobPhotoForArea(photos, 'side', 'before')).toBeNull()
    expect(jobPhotoForArea(photos, 'side', 'after')?.id).toBe('right')
  })
})

describe('words', () => {
  test('scans left and the share text carry no personal data', () => {
    expect(scansLeftLine(2)).toEqual({ key: '{left} of {perDay} scans left today', left: 2, perDay: 3 })
    expect(scansLeftLine(1).key).toBe('{left} of {perDay} scan left today')
    expect(shineShareText({ before: 46, after: 92 })).toBe("My car's Shine went 46 → 92 with Detlio.")
    expect(shineShareText({ score: 62 })).toBe("My car's Shine Score is 62/100 on Detlio.")
  })
})
