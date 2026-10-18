import { describe, expect, test } from 'bun:test'
import type { JobPhoto } from '@repo/core/types'
import {
  angleLabel,
  angleSlots,
  beforeAfterPairs,
  extraPhotos,
  photoGateMessage,
} from './job-photo-standards'

let n = 0
const photo = (by: JobPhoto['by'], stage: JobPhoto['stage'], angle: JobPhoto['angle']): JobPhoto => ({
  id: `p${++n}`,
  stage,
  by,
  angle,
  url: `https://photos.test/p${n}.jpg`,
  createdAt: new Date(2026, 9, 18, 10, n).toISOString(),
})

describe('the guided checklist', () => {
  test('each angle shows its latest photo of that side and stage; the rest are extras', () => {
    const firstFront = photo('garage', 'before', 'front')
    const secondFront = photo('garage', 'before', 'front')
    const extra = photo('garage', 'before', null)
    const customers = photo('customer', 'before', 'back')
    const photos = [firstFront, secondFront, extra, customers]

    const slots = angleSlots(photos, 'garage', 'before')
    expect(slots.map((slot) => slot.angle)).toEqual(['front', 'back', 'left', 'right', 'interior'])
    expect(slots[0].photo?.id).toBe(secondFront.id)
    expect(slots[1].photo).toBeNull()
    expect(extraPhotos(photos, 'garage', 'before').map((p) => p.id)).toEqual([firstFront.id, extra.id])
    expect(angleSlots(photos, 'customer', 'before')[1].photo?.id).toBe(customers.id)
  })

  test('labels', () => {
    expect(angleLabel('left')).toBe('Left side')
    expect(angleLabel(null)).toBe('Extra')
    expect(photoGateMessage({ stage: 'after', missing: 2 })).toBe('Add 2 after photos to complete.')
  })
})

describe('beforeAfterPairs', () => {
  test("the garage's pair where it has both; the customer's otherwise; none with one stage", () => {
    const gFrontBefore = photo('garage', 'before', 'front')
    const gFrontAfter = photo('garage', 'after', 'front')
    const cFrontBefore = photo('customer', 'before', 'front')
    const cBackBefore = photo('customer', 'before', 'back')
    const cBackAfter = photo('customer', 'after', 'back')
    const gLeftBefore = photo('garage', 'before', 'left')
    const pairs = beforeAfterPairs([gFrontBefore, gFrontAfter, cFrontBefore, cBackBefore, cBackAfter, gLeftBefore])
    expect(pairs.map((p) => [p.angle, p.before.id, p.after.id])).toEqual([
      ['front', gFrontBefore.id, gFrontAfter.id],
      ['back', cBackBefore.id, cBackAfter.id],
    ])
  })

  test("one side's before with the other's after when neither has both", () => {
    const cBefore = photo('customer', 'before', 'interior')
    const gAfter = photo('garage', 'after', 'interior')
    expect(beforeAfterPairs([cBefore, gAfter])).toEqual([{ angle: 'interior', before: cBefore, after: gAfter }])
  })

  test('photos with no angle are never paired', () => {
    expect(beforeAfterPairs([photo('garage', 'before', null), photo('garage', 'after', null)])).toEqual([])
  })
})
